import { useState, useEffect, useContext } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "../ui/sheet";
import Browser from "webextension-polyfill";
import MarkdownIt from "markdown-it";
import hljs from "highlight.js";
import ScrollToBottom from "react-scroll-to-bottom";
import { PortalContext } from "@/entrypoints/content";
import { Button } from "../ui/button";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: {
    content_type: string;
    parts: string[];
  };
}

const AnswerModal = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [currentMessage, setCurrentMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // DOM manipulation code
    let textarea = document.querySelectorAll("#divnoselect textarea");

    if (textarea) {
      for (let i = 0; i < textarea.length; i++) {
        let cur = textarea[i] as HTMLTextAreaElement;
        if (cur.style.display !== "none") {
          cur.classList.add("getActualQuestion");
        }
      }
    }

    let span = document.querySelectorAll("#divnoselect span");

    if (span) {
      for (let i = 0; i < span.length; i++) {
        let cur = span[i] as HTMLElement;
        if (cur.style.display !== "none") {
          cur.classList.add("getActualQuestion");
        }
      }
    }
  }, []);

  const markdown = new MarkdownIt();

  const startNewConversation = async () => {
    await Browser.runtime.sendMessage({ type: "NEW_CONVERSATION" });
    setMessages([]);
  };

  const sendMessage = async (message: string) => {
    try {
      setIsLoading(true);
      // setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", content: { content_type: "text", parts: [message] } }]);

      const response = await Browser.runtime.sendMessage({
        type: "CHAT_REQUEST",
        message,
      });
      setIsLoading(false);

      if (!response.success) {
        setError(response.error);
        throw new Error(response.error);
      }
    } catch (error) {
      setError(error as string);
      console.error("Error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    setError(null);
    sendMessage(input);
    setInput("");
  };

  useEffect(() => {
    const styleSheet = document.createElement("link");
    styleSheet.rel = "stylesheet";
    styleSheet.href = "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.7.0/styles/github.min.css";
    document.head.appendChild(styleSheet);

    const messageListener = (message: any) => {
      if (message.type === "CHAT_RESPONSE_CHUNK") {
        setCurrentMessage(message.data);
      } else if (message.type === "CHAT_RESPONSE_COMPLETE") {
        const { messages: newMessages, conversationId: newId } = message.data;
        setMessages(newMessages);
        setCurrentMessage("");
        setIsLoading(false);
      } else if (message.type === "UPDATE_MESSAGES") {
        const { messages: newMessages, conversationId: newId } = message.data;
        setMessages(newMessages);
        setCurrentMessage("");
      }
    };

    setTimeout(() => {
      let question: string | null = null;
      if (document.querySelector("#divnoselect textarea.getActualQuestion")) {
        question = (document.querySelector("#divnoselect textarea.getActualQuestion") as HTMLTextAreaElement)?.value;
        console.log("question textarea", question);
      } else if (document.querySelector("#divnoselect span.getActualQuestion")) {
        question = (document.querySelector("#divnoselect span.getActualQuestion") as HTMLElement)?.innerText;
        console.log("question span", question);
      }

      let q1: string | null = null;
      let q2: string | null = null;
      let q3: string | null = null;
      let q4: string | null = null;

      if (document.getElementById("lblExpression0")) {
        q1 = (document.querySelector("#lblExpression0") as HTMLElement)?.innerText;
      } else if (document.getElementById("lblAnswer0")) {
        q1 = (document.getElementById("lblAnswer0") as HTMLInputElement)?.value;
      }

      if (document.getElementById("lblExpression1")) {
        q2 = (document.querySelector("#lblExpression1") as HTMLElement)?.innerText;
      } else if (document.getElementById("lblAnswer1")) {
        q2 = (document.getElementById("lblAnswer1") as HTMLInputElement)?.value;
      }

      if (document.getElementById("lblExpression2")) {
        q3 = (document.querySelector("#lblExpression2") as HTMLElement)?.innerText;
      } else if (document.getElementById("lblAnswer2")) {
        q3 = (document.getElementById("lblAnswer2") as HTMLInputElement)?.value;
      }

      if (document.getElementById("lblExpression3")) {
        q4 = (document.querySelector("#lblExpression3") as HTMLElement)?.innerText;
      } else if (document.getElementById("lblAnswer3")) {
        q4 = (document.getElementById("lblAnswer3") as HTMLInputElement)?.value;
      }

      const newLine = "\n \n";
      const guidMsg = "You have to select the correct answer from the options, Here is MCQ for you:";
      console.log("question", question);
      if (question) {
        if (messages.length === 0) {
          const mc = q1 && q2 && q3 && q4 ? q1 + newLine + q2 + newLine + q3 + newLine + q4 + newLine : "";
          // run("Show me the example of HTML CSS and JavaScript");

          setInput(guidMsg + newLine + question + newLine + mc);
        }
      }
    }, 1000);
    Browser.runtime.onMessage.addListener(messageListener);
    return () => {
      Browser.runtime.onMessage.removeListener(messageListener);
      styleSheet.remove();
    };
  }, []);

  useEffect(() => {
    hljs.highlightAll();
  }, [isOpen, messages, currentMessage]);

  // console.log("messages", messages);

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger
        className="px-4 py-1 rounded bg-blue-500 text-white font-semibold disabled:bg-gray-300 disabled:cursor-not-allowed fixed top-1/2 -translate-y-1/2 right-[-49px] transform -rotate-90 z-9 cursor-pointer"
        onClick={() => {
          setIsOpen(true);
          input && sendMessage(input);
          setInput("");
        }}
      >
        View Answer
      </SheetTrigger>
      <SheetContent container={useContext(PortalContext)}>
        <SheetHeader>
          <div className="flex justify-between items-center mb-4">
            <SheetTitle>ChatGPT for Vu Quiz</SheetTitle>
            <Button variant="outline" size="xs" onClick={startNewConversation} className="mr-5">
              New Chat
            </Button>
          </div>
          {/* <SheetDescription>Ask ChatGPT about your quiz questions</SheetDescription> */}
        </SheetHeader>

        <div className="flex flex-col h-[calc(100vh-110px)] mt-4 p-4">
          <ScrollToBottom className="overflow-auto h-full">
            <div className="flex-1 overflow-y-auto space-y-4 mb-4 chat-gpt-container">
              {messages.map((msg, index) => (
                <div key={index} className="flex justify-end">
                  <div className={`p-3 overflow-x-auto rounded-lg ${msg.role === "assistant" ? "bg-gray-100 mr-auto" : "bg-blue-100 ml-auto"}`}>
                    <div dangerouslySetInnerHTML={{ __html: markdown.render(msg.content.parts.join(" ")) }} />
                  </div>
                </div>
              ))}
              {currentMessage && (
                <div className="flex justify-end">
                  <div className="p-3 bg-gray-100 rounded-lg mr-auto">{currentMessage}</div>
                </div>
              )}
              {isLoading && !currentMessage && (
                <div className="flex justify-end">
                  <div className="p-3 bg-gray-50 rounded-lg  mr-auto">Thinking...</div>
                </div>
              )}
              {error && (
                <div className="flex justify-end">
                  <div className="p-3 bg-red-100 rounded-lg mr-auto">{error?.toString()}</div>
                </div>
              )}
            </div>
          </ScrollToBottom>

          <form onSubmit={handleSubmit} className="flex gap-2 pt-2">
            <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type your question..." className="flex-1 p-2 border rounded-md" disabled={isLoading} />
            <button type="submit" disabled={isLoading} className="px-4 py-2 bg-blue-500 text-white rounded-md disabled:opacity-50">
              Send
            </button>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default AnswerModal;
