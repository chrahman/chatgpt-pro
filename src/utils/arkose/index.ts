export interface ArkoseConfig {
  chatgptArkoseReqUrl: string;
  chatgptArkoseReqParams: string;
  chatgptArkoseReqForm: string;
}

export async function getArkoseToken(config: ArkoseConfig) {
  if (!config.chatgptArkoseReqUrl)
    throw new Error(
      "Please login at https://chatgpt.com first" +
        "\n\n" +
        "Please keep https://chatgpt.com open and try again. If it still doesn't work, type some characters in the input box of chatgpt web page and try again."
    );

  const arkoseToken = await fetch(config.chatgptArkoseReqUrl + "?" + config.chatgptArkoseReqParams, {
    method: "POST",
    body: config.chatgptArkoseReqForm,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    },
  })
    .then((resp) => resp.json())
    .then((resp) => resp.token)
    .catch(() => null);
  if (!arkoseToken)
    throw new Error(
      "Failed to get arkose token." + "\n\n" + "Please keep https://chatgpt.com open and try again. If it still doesn't work, type some characters in the input box of chatgpt web page and try again."
    );

  return arkoseToken;
}
