import React, { useEffect, useState } from "react";
import { Button } from "../ui/button";
import toast from "react-hot-toast";
import Browser from "webextension-polyfill";

const SKIP_LIMIT = 50000;
const COOLDOWN_DURATION = 90;

const SkipLesson = () => {
  const [skipCount, setSkipCount] = useState<number>(parseInt(localStorage.getItem("lectureSkipCount") || "0"));
  const [cooldown, setCooldown] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (skipCount >= SKIP_LIMIT) {
      startCoolDown();
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("lectureSkipCount", skipCount.toString());
  }, [skipCount]);

  const startCoolDown = () => {
    let remaining = COOLDOWN_DURATION;
    const timer = setInterval(() => {
      remaining--;
      setCooldown(remaining);

      if (remaining <= 0) {
        clearInterval(timer);
        setCooldown(null);
        setSkipCount(0);
      }
    }, 1000);
  };

  const handleSkip = async () => {
    if (cooldown || skipCount >= SKIP_LIMIT) {
      toast.error("Please upgrade to skip more lectures");
      return;
    }

    setIsLoading(true);
    try {
      const result = await Browser.runtime.sendMessage({ action: "skipLecture" });
      if (result?.success) {
        setSkipCount((prev) => prev + 1);
        toast.success("Lecture skipped successfully");

        if (skipCount + 1 >= SKIP_LIMIT) {
          startCoolDown();
        }
      }
    } catch (error) {
      toast.error("Failed to skip lecture");
    }
    setIsLoading(false);
  };

  if (!window.location.pathname.includes("/LessonViewer.aspx")) {
    return null;
  }

  return (
    <div className="flex items-center justify-center h-screen">
      <Button
        onClick={handleSkip}
        disabled={isLoading || cooldown !== null}
        className={`fixed bottom-10 left-1/2 -translate-x-1/2 px-4 py-2 rounded bg-blue-500 text-white font-semibold disabled:bg-gray-300 disabled:cursor-not-allowed`}
      >
        {isLoading ? "Skipping..." : cooldown !== null ? `Wait ${cooldown}s` : "Skip Lecture"}
      </Button>
    </div>
  );
};

export default SkipLesson;
