import Browser from "webextension-polyfill";
import { setUserConfig, getUserConfig } from "@/utils/helper";
import { getArkoseToken } from "@/utils/arkose";
import { generateProofToken } from "@/utils/proofToken";
import { parseSSEResponse } from "@/utils/sse/sse";
import { ResponseContent, ResponseMessage, ImageContent } from "@/types";

export default defineBackground(() => {
  let arkoseError: Error | undefined;

  const defaultConfig = {
    chatgptArkoseReqParams: "public_key=35536E1E-65B4-4D96-9D97-6ADB7EFF8147",
  };

  interface ChatMessage {
    id: string;
    role: "user" | "assistant";
    content: {
      content_type: string;
      parts: string[];
    };
  }
  interface ConversationState {
    conversation_id: string | undefined;
    messages: ChatMessage[];
    currentMessage: string;
  }

  let currentConversation: ConversationState = {
    conversation_id: undefined,
    messages: [],
    currentMessage: "",
  };
  console.log("currentConversation", currentConversation);
  Browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === "complete") {
      currentConversation = {
        conversation_id: undefined,
        messages: [],
        currentMessage: "",
      };
    }
  });

  async function getRequirements(accessToken: string) {
    const response = JSON.parse(
      await (
        await fetch("https://chatgpt.com/backend-api/sentinel/chat-requirements", {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` },
        })
      ).text()
    );
    if (response) {
      return response;
    }
  }

  async function getAccessToken(): Promise<string> {
    const resp = await fetch("https://chatgpt.com/api/auth/session");
    if (resp.status === 403) {
      throw new Error("CLOUDFLARE");
    }
    const data = await resp.json();
    if (!data.accessToken) {
      throw new Error("UNAUTHORIZED");
    }
    return data.accessToken;
  }

  async function sendMessageToChatGPT(message: string, messageId: string) {
    const accessToken = await getAccessToken();
    const config = await getUserConfig();
    let proofToken: string | undefined;

    const [requirements, arkoseToken] = await Promise.all([
      getRequirements(accessToken).catch(() => undefined),
      getArkoseToken(config).catch((e) => {
        arkoseError = e;
      }),
    ]);
    const needArkoseToken = requirements && requirements.arkose?.required;

    if (requirements?.proofofwork?.required) {
      proofToken = generateProofToken(requirements.proofofwork.seed, requirements.proofofwork.difficulty, navigator.userAgent);
    }

    let cookie;
    let oaiDeviceId;
    if (Browser.cookies && Browser.cookies.getAll) {
      cookie = (await Browser.cookies.getAll({ url: "https://chatgpt.com/" }))
        .map((cookie) => {
          return `${cookie.name}=${cookie.value}`;
        })
        .join("; ");
      oaiDeviceId = (
        await Browser.cookies.get({
          url: "https://chatgpt.com/",
          name: "ooai-device-id",
        })
      )?.value;
    }

    try {
      const response = await fetch("https://chatgpt.com/backend-api/conversation", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
          ...(cookie && { Cookie: cookie }),
          ...(needArkoseToken && { "Openai-Sentinel-Arkose-Token": arkoseToken }),
          ...(requirements && { "Openai-Sentinel-Chat-Requirements-Token": requirements.token }),
          ...(proofToken && { "Openai-Sentinel-Proof-Token": proofToken }),
          "Oai-Device-Id": oaiDeviceId,
          "Oai-Language": "en-US",
        },
        body: JSON.stringify({
          action: "next",
          messages: [
            {
              id: messageId,
              role: "user",
              content: { content_type: "text", parts: [message] },
            },
          ],
          conversation_id: currentConversation?.conversation_id,
          parent_message_id: currentConversation.messages[currentConversation.messages.length - 1]?.id || crypto.randomUUID(),
          model: "text-davinci-002-render-sha",
        }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData?.detail || response?.statusText || `HTTP error! status: ${response.status}`);
      }
      return response;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  function removeCitations(text: string) {
    return text.replaceAll(/\u3010\d+\u2020source\u3011/g, "");
  }

  function parseResponseContent(content: ResponseContent): { text?: string; image?: ImageContent } {
    if (content?.content_type === "text") {
      return { text: removeCitations(content?.parts?.[0] ?? "") };
    }
    if (content?.content_type === "code") {
      return { text: "_" + content?.text + "_" };
    }
    if (content?.content_type === "multimodal_text") {
      for (const part of content?.parts ?? []) {
        if (part?.content_type === "image_asset_pointer") {
          return { image: part };
        }
      }
    }
    return {};
  }

  // Update message handler
  Browser.runtime.onMessage.addListener(async (request) => {
    if (request.type === "CHAT_REQUEST") {
      // also update question message
      const newMessages = [
        ...currentConversation.messages,
        {
          id: crypto.randomUUID(),
          role: "user",
          content: { content_type: "text", parts: [request.message] },
        },
      ];

      Browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
        Browser.tabs.sendMessage(tabs[0].id!, {
          type: "UPDATE_MESSAGES",
          data: {
            messages: newMessages,
          },
        });
      });

      currentConversation.messages = newMessages as ChatMessage[];
      try {
        const messageId = crypto.randomUUID();
        const response = await sendMessageToChatGPT(request.message, messageId);
        if (!response.ok) {
          throw new Error(response.statusText ?? "Unknown error from ChatGPT message API");
        }

        // Reset current message for new stream
        currentConversation.currentMessage = "";

        await parseSSEResponse(response, (message) => {
          try {
            // Skip processing if message is "[DONE]"
            if (message === "[DONE]") {
              return;
            }

            const parsed = JSON.parse(message);
            const content = parsed?.message?.content as ResponseContent;
            const { text } = parseResponseContent(content);

            if (text) {
              // Update current message with new chunk
              currentConversation.currentMessage = text;
              // Send update to content script
              Browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
                Browser.tabs.sendMessage(tabs[0].id!, {
                  type: "CHAT_RESPONSE_CHUNK",
                  data: currentConversation.currentMessage,
                });
              });
            }
            const isFirstMessage = !currentConversation?.conversation_id;
            console.log("parsed", parsed);
            if (parsed?.type === "message_stream_complete") {
              // Add completed message to conversation history
              currentConversation = {
                ...currentConversation,
                ...(isFirstMessage && { conversation_id: parsed?.conversation_id }),
                messages: [
                  ...currentConversation.messages,
                  {
                    id: messageId,
                    role: "assistant",
                    content: { content_type: "text", parts: [currentConversation.currentMessage] },
                  },
                ],
              };

              Browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
                Browser.tabs.sendMessage(tabs[0].id!, {
                  type: "CHAT_RESPONSE_COMPLETE",
                  data: {
                    messages: currentConversation.messages,
                    conversation_id: parsed?.conversation_id,
                  },
                });
              });
              return;
            }
          } catch (err) {
            console.error(err);
          }
        });

        return { success: true, data: "Streaming started" };
      } catch (error) {
        return { success: false, error: (error as Error)?.message ?? "Unknown error" };
      }
    } else if (request.type === "NEW_CONVERSATION") {
      currentConversation = {
        conversation_id: undefined,
        messages: [],
        currentMessage: "",
      };
      return { success: true };
    }
  });

  try {
    Browser.webRequest.onBeforeRequest.addListener(
      (details) => {
        if (!details.requestBody) return;
        if (details.url.includes("/public_key") && !details.url.includes(defaultConfig.chatgptArkoseReqParams)) {
          let formData = new URLSearchParams();
          for (const k in details.requestBody.formData) {
            formData.append(k, details.requestBody.formData[k]);
          }
          setUserConfig({
            chatgptArkoseReqUrl: details.url,
            chatgptArkoseReqForm: formData.toString() || (details.requestBody.raw?.[0]?.bytes ? new TextDecoder("utf-8").decode(new Uint8Array(details.requestBody.raw[0].bytes)) : ""),
          }).then(() => {
            console.log("Arkose req url and form saved");
          });
        }
      },
      {
        urls: ["https://*.openai.com/*", "https://*.chatgpt.com/*"],
        types: ["xmlhttprequest"],
      },
      ["requestBody"]
    );
  } catch (error) {
    console.log(error);
  }

  // For skip lesson
  declare const PageMethods: {
    SaveStudentVideoLog: (
      studentId: string | undefined,
      courseCode: string | undefined,
      semester: string | undefined,
      lessonNumber: string | undefined,
      contentId: string | undefined,
      viewDuration: number,
      logText: string | number,
      videoId: string | undefined,
      isVideo: string | undefined,
      url: string,
      callback: (result: any) => void
    ) => void;
  };

  declare const UpdateTabStatus: (status: string, tabId: string, lessonNumber: string) => void;

  declare const chrome: any;

  async function skipLecture(e: any) {
    try {
      const result = await chrome.scripting.executeScript({
        target: { tabId: e.tab?.id as number },
        world: "MAIN",
        func: async () => {
          type TabId = string;

          function getElement<T extends HTMLElement>(selector: string): T | null {
            return document.querySelector(selector);
          }

          async function handleVideoTab(tabId: TabId): Promise<string> {
            const completionStatus = getElement<HTMLInputElement>(`#hfTabCompletionStatus${tabId}`)?.value;
            if (completionStatus === "Completed") return Promise.resolve(completionStatus);

            const isVideo = getElement<HTMLInputElement>(`#hfIsVideo${tabId}`)?.value;
            const contentId = getElement<HTMLInputElement>(`#hfContentID${tabId}`)?.value;
            const videoId = getElement<HTMLInputElement>(`#hfVideoID${tabId}`)?.value;

            const studentId = getElement<HTMLInputElement>("#hfStudentID")?.value;
            const courseCode = getElement<HTMLInputElement>("#hfCourseCode")?.value;
            const semester = getElement<HTMLInputElement>("#hfEnrollmentSemester")?.value;
            const lessonTitle = document.getElementById("MainContent_lblLessonTitle")?.title.split(":")[0].replace("Lesson", "").trim() ?? "";

            function getRandomNumber(min: number, max: number): number {
              return Math.floor(Math.random() * (max - min + 1) + min);
            }

            const duration = getRandomNumber(400, 800);

            return new Promise<string>((resolve) => {
              PageMethods.SaveStudentVideoLog(
                studentId!,
                courseCode!,
                semester!,
                lessonTitle,
                contentId!,
                duration,
                "", // Extra field
                videoId!,
                isVideo!,
                window.location.href,
                (response: any) => resolve(response)
              );
            });
          }

          async function handleReadingTab(tabId: TabId): Promise<string> {
            const completionStatus = getElement<HTMLInputElement>(`#hfTabCompletionStatus${tabId}`)?.value;
            if (completionStatus === "Completed") return Promise.resolve(completionStatus);

            const contentId = getElement<HTMLInputElement>(`#hfContentID${tabId}`)?.value;
            const studentId = getElement<HTMLInputElement>("#hfStudentID")?.value;
            const courseCode = getElement<HTMLInputElement>("#hfCourseCode")?.value;
            const semester = getElement<HTMLInputElement>("#hfEnrollmentSemester")?.value;
            const lessonTitle = document.getElementById("MainContent_lblLessonTitle")?.title.split(":")[0].replace("Lesson", "").trim() ?? "";

            const duration = Math.floor(Math.random() * (12 - 5 + 1) + 5); // Random duration between 5 and 12

            return new Promise<string>((resolve) => {
              PageMethods.SaveStudentVideoLog(
                studentId!,
                courseCode!,
                semester!,
                lessonTitle,
                contentId!,
                duration,
                3, // Fixed value
                "", // Extra field
                "0", // Fixed value for video
                window.location.href,
                (response: any) => resolve(response)
              );
            });
          }

          const tabIds: TabId[] = Array.from(document.querySelectorAll(".tab-content .tab-pane")).map((tab) => tab.id.replace("tab", ""));

          try {
            const failedTab = (
              await Promise.race([
                new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Timeout")), 5000)),
                Promise.allSettled(
                  tabIds.map((tabId) => {
                    const isVideo = getElement<HTMLInputElement>(`#hfIsVideo${tabId}`)?.value;
                    return !isVideo || isVideo === "0"
                      ? handleReadingTab(tabId).catch((error) => {
                          console.error(error);
                          throw new Error("Unable to skip reading");
                        })
                      : handleVideoTab(tabId).catch((error) => {
                          console.error(error);
                          throw new Error("Unable to skip video");
                        });
                  })
                ),
              ])
            ).find((result) => result.status === "rejected") as PromiseRejectedResult;

            if (failedTab) throw failedTab.reason;
          } catch (error: any) {
            return { success: false, error: error?.message ?? error };
          }

          const lastTabId = tabIds[tabIds.length - 1];
          const activeTab = getElement<HTMLInputElement>("#hfActiveTab");
          if (activeTab) activeTab.value = lastTabId;

          UpdateTabStatus("Completed", lastTabId, "-1");

          const nextLessonButton = getElement<HTMLAnchorElement>("#lbtnNextLesson");
          if (nextLessonButton instanceof HTMLAnchorElement) {
            nextLessonButton.classList.remove("disabled");
            nextLessonButton.click();
          }

          return { success: true };
        },
      });

      return result && result[0].result ? result[0].result : { success: false, error: "Unable to skip lecture" };
    } catch (error) {
      console.log("error", error);
      return { success: false, error: error };
    }
  }

  // Handle messages from content script
  chrome.runtime.onMessage.addListener((message: any, sender: any, sendResponse: any) => {
    if (message.action === "skipLecture") {
      (async () => {
        try {
          const result = await skipLecture(sender);
          sendResponse(result);
        } catch (error) {
          sendResponse({
            success: false,
            error: error,
          });
        }
      })();
      return true; // Keep channel open for async response
    }
  });
});
