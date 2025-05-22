import Browser from "webextension-polyfill";
import { ArkoseConfig } from "./arkose";

interface UserConfig {
  chatgptArkoseReqUrl?: string;
  chatgptArkoseReqForm?: string;
}

export async function setUserConfig(value: UserConfig) {
  await Browser.storage.local.set(value);
}

export async function getUserConfig(): Promise<ArkoseConfig> {
  const config = await Browser.storage.local.get();
  return {
    chatgptArkoseReqUrl: config.chatgptArkoseReqUrl || "",
    chatgptArkoseReqParams: "public_key=35536E1E-65B4-4D96-9D97-6ADB7EFF8147",
    chatgptArkoseReqForm: config.chatgptArkoseReqForm || "",
  };
}
