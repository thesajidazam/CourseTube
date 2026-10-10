# Changelog

## 2.2.2
- **Fixed:** the dynamic colour changing several times during a lecture. One colour is now chosen per lecture (YouTube's own colour, else the video picture) and kept; the progress bar uses that same colour instead of a moving palette.
- **Fixed:** real course playlists being ignored. Detection waits until the playlist panel has finished loading before judging, no longer remembers a negative verdict (the next lecture gets another look), and recognises more evidence: course words in other languages (Spanish, French, German, Chinese, Japanese, Korean, Russian, Hindi, Arabic and more), subject words, educational channel names, and long average video length. Music, gaming and vlog signals still veto. Earlier saved verdicts are discarded.

## 2.2.0
- **New:** notes are requested as a labelled outline (OVERVIEW / SECTION / TERM / POINT / EXAMPLE / TAKEAWAY / QUESTION) and rendered by CourseTube as a structured sheet, independent of how YouTube formats its reply. Replies that ignore the layout still fall back to the previous formatting.
- **Fixed:** notes not generating on the next lecture. The Ask bridge now waits 3 s after a lecture change, resends a stuck message every 4 s (up to 4 times) and retries once automatically on a timeout. Reply text keeps paragraph breaks so labels never glue to the previous word.
- **Fixed:** YouTube UI flashing during lecture changes. The player stays hidden until it is playing past 0.7 s, YouTube's spinner is hidden, the fade-out is instant, and the overlay is re-asserted if YouTube touches the page.
- **Changed:** logo messages are shorter and always on one line.

## 2.1.0
- **Changed:** smaller logo; the lecture title appears in a thought-bubble pill only while hovering the logo.
- **Changed:** encouragement messages use the same pill, with warmer and more expressive wording (no em-dashes).
- **New:** notes are rendered as a structured study sheet (overview, table of contents, numbered sections, label/value rows, Key takeaways card, numbered self-test questions, reading time).
- **New:** notes and quiz rise with a springy bounce on scroll.
- **Changed:** the scroll hint is now a small arrow under the progress bar instead of a pill.
- **Changed:** "Questions?" heading sits at the left of the history panel and lines up with the playlist panel.
- **Fixed:** chapter titles missing when YouTube's chapter list had no titles; they are now taken from the description.

## 2.0.0 — complete UI overhaul
- **New:** full-screen player with ambient colour in the letterbox bars, a progress bar that paints itself with the lecture's colours over time, and idle auto-hiding chrome.
- **New:** logo + lecture title pill (top-left). The logo talks in a thought bubble: encouragement at 25% / 50% / 75% / finish, plus "notes ready" and "quiz ready" notices.
- **New:** playlist glides out from the left edge, questions from the right edge (progressive colour blur behind each).
- **New:** notes and quiz rise over the video as you scroll while a colour blur takes over; floating "back to the lecture" button.
- **New:** first-run welcome tour (replay by clicking the logo).
- **Fixed:** the extension no longer applies to non-study playlists. Detection needs real evidence and is vetoed by music/gaming/vlog signals; length alone never qualifies; the launcher only shows on recognised study playlists; earlier guesses are discarded. <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd> forces study mode on a playlist that was missed.
- **Improved:** no veil or changes on unknown playlists until they are recognised; smoother lecture switching.

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
