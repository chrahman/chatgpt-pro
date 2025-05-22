import { createParser } from "eventsource-parser";
import { streamAsyncIterable } from "./stream-async-iterable";
import { isEmpty } from "lodash-es";

const statusTextMap = new Map([
  [400, "Bad Request"],
  [401, "Unauthorized"],
  [403, "Forbidden"],
  [429, "Too Many Requests"],
]);

export async function parseSSEResponse(resp: Response, onMessage: (message: string) => void) {
  if (!resp.ok) {
    const error = await resp.json().catch(() => ({}));
    if (!isEmpty(error)) {
      throw new Error(JSON.stringify(error));
    }
    const statusText = resp.statusText || statusTextMap.get(resp.status) || "";
    throw new Error(`${resp.status} ${statusText}`);
  }
  const parser = createParser({
    onEvent(event) {
      console.log("event", event);
      if (event.data) {
        onMessage(event.data);
      }
    },
  });
  // if (fetchOptions.signal) {
  //   console.debug("fetchOptions.signal =", fetchOptions.signal);
  // }
  for await (const chunk of streamAsyncIterable(resp.body!)) {
    const str = new TextDecoder().decode(chunk);
    parser.feed(str);
  }
}
