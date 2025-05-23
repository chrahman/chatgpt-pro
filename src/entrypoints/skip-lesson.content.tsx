import React from "react";
import ReactDOM from "react-dom/client";
import toast, { Toaster } from "react-hot-toast";
import SkipLesson from "@/components/skip-lesson";
import "@/assets/tailwind.css";

export default defineContentScript({
  matches: ["*://*.vu.edu.pk/*"],
  // 2. Set cssInjectionMode
  cssInjectionMode: "ui",

  async main(ctx) {
    // 3. Define your UI
    const ui = await createShadowRootUi(ctx, {
      name: "skip-lesson-ui",
      position: "inline",
      anchor: "body",
      isolateEvents: ["keydown", "keyup", "keypress", "wheel", "scroll"],
      onMount: (container, shadow) => {
        const root = ReactDOM.createRoot(container);

        root.render(
          <>
            <SkipLesson />
            <Toaster />
          </>
        );
        return root;
      },
      onRemove: (root) => {
        // Unmount the root when the UI is removed
        root?.unmount();
      },
    });

    // 4. Mount the UI
    ui.mount();
  },
});
