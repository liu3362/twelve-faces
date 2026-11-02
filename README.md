# Twelve Faces

**English** · [中文](README.zh-CN.md)

Flip the dodecahedron to step into a subject; flip the small die to start a focus timer.

- **Eight languages**: English (default), Simplified Chinese, Traditional Chinese, Japanese, Korean, Spanish, Brazilian Portuguese and French. Switch in Settings → Language. The interface, the subjects (adapted to each country’s school system, e.g. Kokugo in Japanese, SVT in French), the year names and the AI’s teaching language all follow.
- **A die you navigate by turning**: each face is a subject (literature, math, languages, physics, chemistry, biology, history, geography, coding, art, PE, study hall). The face pointing at you sets the colour, paper texture, fonts, to-dos, notes and the AI’s teaching style.
- **Three identities**: secondary school by default. In Settings → Shelf you can switch to university (calculus, languages, your major courses, writing, exams…) or working (deep work, communication, writing, projects, data…). Every face can be renamed to your own course or project. Suggested daily cap on the timeline: 2 hours for school, 4 hours for university and work.
- **Shelf and new dice (prototype)**: tap “New” in the All-subjects menu or in Settings → Shelf, enter a school, department and major, and pick years. The AI builds one die per year; preview it, rename faces, then put it on the shelf. You can also enter a job (e.g. “product manager”) to get a die for learning that job. Paste your school’s curriculum and the AI only picks courses from it; without it you get a guide based on a typical curriculum. Generated dice are saved on your device, so opening them again costs no tokens. Keep several majors and years and switch any time.
- **Timer die**: each face is a length (5 to 120 minutes); flip to start. Pomodoro mode starts a break after each focus, with a longer one every 4th time.
- **Today**: set a daily goal per face. The timeline shows the day’s study and rest; time past the daily cap is drawn in a different colour.
- **Ask AI**: each face has its own teaching style. The AI can also act for you: “add a to-do to review chapter 2, then start 25 minutes”.
- **Deep thinking**: a toggle under the question box, on by default. It handles hard questions better but is slower and uses more tokens; turn it off for simple ones. Building dice and planning the day never use it.
- **Several AIs with automatic fallback**: add keys from a few providers; the first one is used first, and when it runs out of quota or fails, the next one takes over.

No sign-up and no server. Everything (to-dos, notes, timer history, keys) stays in your own browser.

## Getting started

1. Open the page and tap **Settings** at the top right.
2. Pick one or two AI providers, tap “Get a key”, sign up on their site, copy the API key and paste it back.
3. Tap **Test**. “Works” means you’re set.
4. Use the arrows to reorder; put the ones you use most, or the free ones, first.

Free tiers change quickly. The table reflects what we found when writing this (October 2026); **always check each provider’s official page**:

| Provider | Default model | Free tier |
|---|---|---|
| Claude | claude-haiku-5-5 | Pay as you go; the small model is cheap |
| DeepSeek | deepseek-flash | Free tokens for new users (tested and working) |
| Zhipu GLM | glm-4.7-flash | Flash models are free |
| Volcengine Doubao | doubao-seed-2-0-lite | Free tokens every day |
| SiliconFlow | Qwen/Qwen2.5-7B-Instruct | Some small models are free |
| Google Gemini | gemini-3.8-flash | Free tier, rate-limited |
| OpenRouter | your choice | Free models end in `:free` |
| Custom | your choice | Any OpenAI-compatible service, e.g. Ollama on your computer |

You can change the model name in Settings. If a provider renames or retires a model, Test will say the model name is wrong; just pick another.

### For parents and teachers

- Some providers require ID verification; students under 18 may need a parent to get a key.
- Everyone should use their own key. Sharing one key among many people gets rate-limited fast and may break the provider’s terms.
- Keys are stored in the browser. On a shared computer, clear them in Settings → Backup and reset when you’re done.

### Moving to another device

Data lives only on this device. Export a backup in Settings → Backup and reset, then import it on the new device. Backups never include keys.

## Put it online (GitHub Pages, free)

1. Create a repository on GitHub, e.g. `twelve-faces`.
2. Click **Add file → Upload files** and drag in everything inside this folder (keep the `css`, `js`, `locales` and `vendor` folders), then commit.
3. Open the repository’s **Settings → Pages**, choose **Deploy from a branch**, branch `main`, folder `/ (root)`, and save.
4. After a minute or two the page is live at `https://your-username.github.io/twelve-faces/`.

You can also skip hosting: double-click `index.html` to open it in a browser.

### Feedback

Once hosted on GitHub Pages, the button in Settings → Feedback opens this repository’s Issues page, pre-filled with the die in use and any renamed faces (users can delete them). Keep Issues turned on in the repository settings. To use a survey or email instead, set `FEEDBACK_URL` in `js/settings.js`.

The page itself collects no usage data.

## Known limitations

- **Calling AIs straight from the browser**: the page calls each provider’s API directly from the browser. DeepSeek has been tested and works; Claude and OpenRouter officially support it. Others haven’t been verified; if Test says it “can’t connect … this provider blocks calls from web pages”, that provider doesn’t allow it, so use another.
- Google Fonts may not load in some regions; system fonts are used instead and nothing breaks.
- 3D needs WebGL. Without it the page shows subject buttons and everything else works the same.

## Files

```
index.html        the page
icon.svg          the tab icon (a line-drawn dodecahedron)
css/app.css       styles
js/i18n.js        translations: code only uses keys; text comes from the current language pack
locales/*.js      language packs: en, zh, zh-TW, ja, ko, es, pt-BR, fr (subjects, teaching styles and AI prompts live here too)
js/profiles.js    the three identities and their twelve faces (structure only: keys, colours, textures)
js/app.js         the dice, timer, to-dos, notes, timeline and Ask AI
js/ai.js          one interface to many AI providers, with automatic fallback
js/settings.js    settings: language, shelf, feedback, AI keys, backups
js/maker.js       new dice (AI builds them by major and year, or by job)
vendor/three.min.js  three.js r128 (MIT licence, see vendor/three.LICENSE)
```

No build step and nothing to install. Edit a file and reload the page.

### Adding a language

1. Copy `locales/en.js` to, say, `locales/it.js`. Change `'en'` on the first line to `'it'` and translate the text after each key (leave placeholders like `{name}` as they are). Adapt subjects and year names to that country’s schools.
2. In `index.html`, add `<script src="locales/it.js"></script>` after the last `locales/…` line.

The new language appears in Settings automatically. Missing keys fall back to English and are reported in the browser console.

## Licence

MIT, see [LICENSE](LICENSE).
