import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import toast, { Toaster } from "react-hot-toast";
import AnswerModal from "@/components/answer-modal";
import "@/assets/tailwind.css";

export const PortalContext = React.createContext<HTMLElement | null>(null);

const ContentRoot = ({ children }: { children: React.ReactNode }) => {
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);

  return (
    <React.StrictMode>
      <PortalContext.Provider value={portalContainer}>
        <div ref={setPortalContainer} id="command-portal-container">
          {children}
        </div>
      </PortalContext.Provider>
    </React.StrictMode>
  );
};

export default defineContentScript({
  matches: ["*://*.vu.edu.pk/Quiz/QuizQuestion.aspx?*", "https://demo-1k2.pages.dev/*"],
  // 2. Set cssInjectionMode
  cssInjectionMode: "ui",

  async main(ctx) {
    // 3. Define your UI
    const ui = await createShadowRootUi(ctx, {
      name: "answer-modal-ui",
      position: "inline",
      anchor: "body",
      inheritStyles: true,
      isolateEvents: ["keydown", "keyup", "keypress", "wheel", "scroll"],
      onMount: (container, shadow) => {
        // Container is a body, and React warns when creating a root on the body, so create a wrapper div
        const app = document.createElement("div");
        container.append(app);

        // Create a root on the UI container and render a component
        const root = ReactDOM.createRoot(app);
        root.render(
          <ContentRoot>
            <AnswerModal />
            <Toaster position="top-center" />
          </ContentRoot>
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
