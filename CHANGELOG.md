# Changelog

## 1.6.0
- **Changed:** the quiz now unlocks at 75% of the lecture (was 25%).
- **New:** until the quiz unlocks, encouraging messages appear in place of the "Quiz time!" heading, changing every ~20 s of watching and at 25% / 50% milestones.
- Updated README screenshots.

## 1.5.2
- **Fixed:** quiz failing because YouTube's Ask replied with its own interactive "AI-generated quiz" card (questions and options, but no readable answers). The request is now worded to get plain text with answers and explanations, with up to three phrasings tried before showing an error.

## 1.5.1
- **Fixed:** quiz showing "reply looked incomplete". The quiz reader now understands many more reply layouts (bold labels, "Question 1:", "(A)", "Correct Answer:", numbered lists), waits longer for long replies, and automatically retries once asking for JSON. If it still fails, "Show Gemini's reply" reveals what came back.
- **New:** the current chapter title (with its number, e.g. "3/12 · Intro") is always shown above the progress bar when chapters exist; hovering still shows the chapter under the cursor.
- **Fixed:** chapters in collapsed descriptions are now detected (the whole description text is read, not only the visible part).

## 1.5.0
- **New:** Quiz panel beside the notes. Generates 5 questions at 25% of the lecture, instant right/wrong feedback, explanation under each answer, progress pips and a final score with retry.
- **New:** Chapters (from YouTube's chapter list or the description) drawn on the progress bar, with titles in the hover tooltip.
- **New:** Per-lecture dynamic colour theme (YouTube's description-box colour, falling back to the video frame), applied to the background, text and Ask box with smooth transitions and a remembered last theme.
- **New:** Collapsible notes panel (state remembered).
- **New:** Updated logo, shown as a tinted cut-out in the top-left corner, in the launcher button and on the loading veil.
- **Changed:** "Questions?" heading is right-aligned to the chat panel.
- **Faster:** pre-built UI, pre-opened Ask panel, quicker answer detection, playlist diffing, cached element refs, throttled background work, GPU-friendly progress bar.

## 1.0.1
- Fixed YouTube's player UI flashing before each lecture.
- Fixed notes and chat freezing when switching lectures (cancellable requests, unique request IDs, per-lecture chat history).

## 1.0.0
- First release: study mode for course playlists, auto notes, context-aware Q&A, screenshots.
