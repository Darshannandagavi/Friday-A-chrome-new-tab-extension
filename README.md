# ⚡ Friday — AI-Powered Chrome Assistant

<p align="center">
  <img src="https://img.shields.io/badge/Friday-AI%20Assistant-7C3AED?style=for-the-badge&logo=google-gemini&logoColor=white" alt="Friday AI">
  <img src="https://img.shields.io/badge/Chrome-Extension-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white" alt="Chrome Extension">
  <img src="https://img.shields.io/badge/Gemini-Live%20API-8E75B2?style=for-the-badge&logo=googlegemini&logoColor=white" alt="Gemini Live">
  <img src="https://img.shields.io/badge/JavaScript-ES6+-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black" alt="JavaScript">
</p>

<p align="center">
  <strong>A personal AI assistant that lives inside your browser.</strong>
</p>

<p align="center">
  Friday brings Gemini-powered conversations, real-time voice interaction, browser tools, customizable personalities, and an intelligent New Tab experience directly into Chrome.
</p>

<p align="center">
  <a href="#-features">Features</a> •
  <a href="#-architecture">Architecture</a> •
  <a href="#-installation">Installation</a> •
  <a href="#-configuration">Configuration</a> •
  <a href="#-roadmap">Roadmap</a>
</p>

---

## ✨ Overview

**Friday** is an AI-powered Chrome New Tab extension inspired by personal assistants such as JARVIS and FRIDAY.

The goal is to create an assistant that is not limited to a traditional chatbot interface. Friday can communicate through **text and real-time voice**, use browser capabilities through a modular tool system, maintain conversation context, and adapt its personality to the user.

### Core idea

> **An AI assistant that lives where you work.**

Instead of opening a separate AI application, Friday is available directly whenever a new browser tab is opened.

---

# 🚀 Features

## 💬 AI Chat

Friday provides a Gemini-powered conversational interface with:

- Gemini-powered conversations
- Streaming text responses
- Conversation history
- Context-aware responses
- Configurable Gemini models
- Multiple Gemini API key support
- Automatic API-key rotation
- Error and quota handling
- Custom system prompts
- Personalized assistant behavior

---

## 🎙️ Real-Time Voice Assistant

Friday integrates **Gemini Live** for real-time voice conversations.

### Voice capabilities

- Real-time two-way voice interaction
- Natural conversational flow
- Microphone input
- Real-time audio streaming
- Input transcription
- Output transcription
- Voice activity detection
- Voice interruption
- Audio playback
- Multiple voice presets
- Custom assistant personalities
- Speaking/listening state visualization

### Voice pipeline

```text
┌──────────────┐
│  Microphone  │
└──────┬───────┘
       │
       ▼
┌──────────────────┐
│ getUserMedia()   │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│   AudioWorklet   │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Float32 PCM      │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ 16 kHz Resample  │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ 16-bit PCM       │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Base64 Encoding  │
└────────┬─────────┘
         │
         ▼
┌─────────────────────────┐
│ Gemini Live WebSocket   │
└────────┬────────────────┘
         │
         ▼
┌──────────────────┐
│ Gemini Response  │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ 24 kHz PCM Audio │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Web Audio API    │
└────────┬─────────┘
         │
         ▼
┌──────────────┐
│   Speaker    │
└──────────────┘
```

---

# 🧠 Browser & Assistant Tools

Friday uses a modular tool architecture that allows the AI to interact with browser capabilities.

The tool system is separated from the core Gemini implementation so new capabilities can be added without rewriting the assistant.

### Examples

- Open websites
- Search the web
- Navigate browser pages
- Access browser tabs
- Read web pages
- Execute browser actions
- Perform assistant-controlled operations

### Tool architecture

```text
                ┌─────────────────┐
                │     Friday      │
                │       AI        │
                └────────┬────────┘
                         │
                         ▼
                ┌─────────────────┐
                │  Tool Manager   │
                └────────┬────────┘
                         │
            ┌────────────┼────────────┐
            │            │            │
            ▼            ▼            ▼
       ┌─────────┐  ┌─────────┐  ┌─────────┐
       │ Browser │  │ Search  │  │  Tabs   │
       │ Actions │  │  Tools  │  │  Tools  │
       └─────────┘  └─────────┘  └─────────┘
```

---

# 🎭 Customizable Personality

Friday is designed to behave differently depending on the selected personality.

Users can configure:

- Assistant name
- Personality preset
- Custom personality
- Voice
- Gemini model
- System instructions

This allows Friday to behave as a:

- Professional assistant
- Friendly assistant
- Technical assistant
- Concise assistant
- Custom user-defined assistant

---

# 🧠 Conversation Context

Friday maintains recent conversation history and can use previous messages when generating responses.

The context flow is:

```text
User Message
      │
      ▼
Conversation Manager
      │
      ▼
Prompt Builder
      │
      ▼
Gemini
      │
      ▼
Response / Tool Call
      │
      ▼
Conversation History
```

The conversation manager also provides context for Gemini Live sessions.

---

# 🔑 Multiple Gemini API Keys

Friday supports multiple Gemini API keys.

This allows the extension to move to another configured key when the current key reaches its quota.

### Example

```text
API Key 1
    │
    ├── Quota exceeded
    ▼
API Key 2
    │
    ├── Quota exceeded
    ▼
API Key 3
    │
    └── Connected
```

If all configured keys are exhausted, Friday stops retrying instead of continuously cycling through the same keys.

> **Important:** API keys should never be hard-coded into the source code or committed to GitHub.

---

# 🏗️ Architecture

```text
                         ┌─────────────────────────┐
                         │       Chrome New Tab    │
                         │          Friday         │
                         └────────────┬────────────┘
                                      │
                     ┌────────────────┴────────────────┐
                     │                                 │
                     ▼                                 ▼
             ┌───────────────┐                 ┌───────────────┐
             │   Text Chat   │                 │   Voice Mode  │
             │               │                 │               │
             │ GeminiService │                 │  GeminiVoice  │
             └───────┬───────┘                 └───────┬───────┘
                     │                                 │
                     └────────────────┬────────────────┘
                                      │
                                      ▼
                             ┌──────────────────┐
                             │   Gemini APIs    │
                             │                  │
                             │ Text Generation  │
                             │ Gemini Live      │
                             └────────┬─────────┘
                                      │
                         ┌────────────┴────────────┐
                         │                         │
                         ▼                         ▼
                 ┌──────────────┐         ┌────────────────┐
                 │ Friday Tools │         │ Conversation   │
                 │              │         │ Manager        │
                 └──────────────┘         └────────────────┘
```

---

# 📁 Project Structure

```text
friday/
│
├── assets/
│
├── shortcuticons/
│
├── audio-capture-worklet.js
├── conversation-manager.js
├── friday-tools.js
├── gemini-service.js
├── gemini-voice.js
├── icons.css
├── manifest.json
├── newtab.css
├── newtab.html
├── newtab.js
├── prompt-builder.js
├── README.md
└── .gitignore
```

---

# 🧩 Core Modules

| File | Responsibility |
|------|----------------|
| `newtab.js` | Main application logic and UI integration |
| `gemini-service.js` | Gemini text generation and streaming |
| `gemini-voice.js` | Gemini Live WebSocket and voice processing |
| `friday-tools.js` | Tool declarations and browser/tool execution |
| `prompt-builder.js` | System prompts and personality configuration |
| `conversation-manager.js` | Conversation history and Live context |
| `audio-capture-worklet.js` | Real-time microphone audio processing |
| `newtab.html` | Chrome New Tab interface |
| `newtab.css` | Application styling |
| `manifest.json` | Chrome Extension configuration |

---

# 🔄 Gemini Integration

Friday supports two primary Gemini interaction modes.

## Text Mode

```text
┌──────────────┐
│     User     │
└──────┬───────┘
       │
       ▼
┌────────────────┐
│ GeminiService  │
└──────┬─────────┘
       │
       ▼
┌────────────────┐
│   Gemini API   │
└──────┬─────────┘
       │
       ▼
┌────────────────┐
│ Streaming Text │
└──────┬─────────┘
       │
       ▼
┌──────────────┐
│   Chat UI    │
└──────────────┘
```

## Voice Mode

```text
┌──────────────┐
│ User Speech  │
└──────┬───────┘
       │
       ▼
┌────────────────┐
│  GeminiVoice   │
└──────┬─────────┘
       │
       ▼
┌─────────────────────┐
│ Gemini Live         │
│ WebSocket           │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ Gemini Native Audio │
└──────┬──────────────┘
       │
       ▼
┌────────────────┐
│ Audio + Text   │
│ Transcription  │
└──────┬─────────┘
       │
       ▼
┌──────────────┐
│    Friday    │
└──────────────┘
```

---

# 🌐 Chrome Extension Architecture

Friday runs as a Chrome New Tab extension.

```text
Chrome Browser
      │
      ▼
New Tab
      │
      ▼
Friday Extension
      │
      ├───────────────┐
      │               │
      ▼               ▼
 Chrome APIs      Gemini APIs
      │               │
      ▼               ▼
Browser Tools    AI Responses
```

---

# 🛠️ Technologies

## Frontend

<p>
  <img src="https://img.shields.io/badge/HTML5-E34F26?style=flat-square&logo=html5&logoColor=white" alt="HTML5">
  <img src="https://img.shields.io/badge/CSS3-1572B6?style=flat-square&logo=css3&logoColor=white" alt="CSS3">
  <img src="https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black" alt="JavaScript">
</p>

- HTML5
- CSS3
- Modern JavaScript
- Chrome Extensions API
- Web Audio API
- AudioWorklet
- WebSocket API

## AI

<p>
  <img src="https://img.shields.io/badge/Google-Gemini-4285F4?style=flat-square&logo=google&logoColor=white" alt="Google Gemini">
  <img src="https://img.shields.io/badge/Gemini-Live-8E75B2?style=flat-square&logo=google-gemini&logoColor=white" alt="Gemini Live">
</p>

- Google Gemini API
- Gemini Live API
- Gemini native audio
- Function calling
- Real-time streaming

## Browser APIs

- Chrome Tabs API
- Chrome Scripting API
- Chrome Storage API
- Chrome Runtime API
- WebSocket API
- MediaDevices API
- Web Audio API

---

# ⚙️ Installation

## 1. Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/friday.git
cd friday
```

## 2. Open Chrome Extensions

Navigate to:

```text
chrome://extensions/
```

## 3. Enable Developer Mode

Enable:

```text
Developer mode
```

## 4. Load the extension

Click:

```text
Load unpacked
```

Then select the Friday project directory.

---

# 🔧 Configuration

After installing Friday:

1. Open a new Chrome tab.
2. Open Friday's settings.
3. Enable Gemini.
4. Add your Gemini API key.
5. Select the Gemini model.
6. Select a voice.
7. Select a personality.
8. Start Chat or Voice Mode.

### Voice permissions

Voice mode requires microphone access.

When Chrome asks for microphone permission, select:

```text
Allow
```

---

# 🔐 Security

API keys are sensitive credentials.

**Never commit Gemini API keys to GitHub.**

Do not hard-code keys inside:

```text
newtab.js
gemini-service.js
gemini-voice.js
friday-tools.js
```

Before pushing to GitHub, check the repository for exposed keys:

```bash
git grep -n -E "AIza|AQ\."
```

You can also check untracked/staged files:

```bash
git status
```

### If a key was exposed

Immediately:

1. Revoke the exposed API key.
2. Generate a new key.
3. Remove the key from the source code.
4. Check Git history if the key was committed.
5. Force-clean Git history if necessary.
6. Update the extension with the new key.

> `.gitignore` prevents future tracking. It does **not** remove secrets that were already committed to Git history.

---

# 🧪 Debugging

Friday includes logging for Gemini Live connection events.

Important events include:

```text
WebSocket OPEN
Setup sent
Setup complete
Microphone started
Audio streaming
WebSocket CLOSED
Quota exceeded
Connection lost
```

For voice problems, check the Chrome extension console.

You can open the extension's DevTools through:

```text
chrome://extensions/
```

Then inspect the relevant extension page/service.

---

# ⚠️ Known Limitations

- Gemini Live requires appropriate API/model access.
- Gemini API usage is subject to account/project quota limits.
- Voice mode requires microphone permission.
- Internet connectivity is required.
- Browser APIs are restricted by Chrome's extension security model.
- Some tools require additional Chrome permissions.
- Real-time voice quality depends on network conditions.
- Gemini Live availability and quotas can change.
- API-key rotation does not bypass account-level or project-level restrictions.
- Browser-based API keys should be treated as sensitive credentials.

---

# 🎯 Design Goals

Friday is built around several principles.

## Natural Interaction

The assistant should feel conversational rather than like a traditional chatbot.

## Low-Latency Voice

Gemini Live and streaming audio are used to minimize the delay between speaking and receiving a response.

## Extensible Tools

Tools are isolated from the core AI implementation so additional capabilities can be added independently.

## Customizable Assistant

Users can configure:

- Name
- Personality
- Voice
- Gemini model
- API keys

## Browser-Native

Friday runs directly inside the Chrome New Tab experience instead of requiring a separate desktop application.

---

# 🗺️ Roadmap

## AI

- [ ] Persistent long-term memory
- [ ] RAG-based knowledge system
- [ ] Better context management
- [ ] Advanced conversation memory
- [ ] Improved prompt orchestration

## Voice

- [ ] Wake-word activation
- [ ] Improved voice interruption
- [ ] Faster audio response
- [ ] More voice controls
- [ ] Better turn detection
- [ ] Voice activity improvements

## Vision

- [ ] Screen understanding
- [ ] Image understanding
- [ ] Computer vision tools
- [ ] Visual browser assistance

## Browser Automation

- [ ] More browser tools
- [ ] Advanced page interaction
- [ ] Multi-tab workflows
- [ ] Automated browser tasks
- [ ] Task planning

## AI Infrastructure

- [ ] Local LLM support
- [ ] RAG pipeline
- [ ] Embedding-based memory
- [ ] Model fallback system
- [ ] Improved tool orchestration

## Distribution

- [ ] Chrome Web Store release
- [ ] Public documentation
- [ ] Installation wizard
- [ ] Better onboarding experience

---

# 🤝 Contributing

Contributions are welcome.

## Fork the repository

```bash
git clone https://github.com/YOUR_USERNAME/friday.git
cd friday
```

## Create a feature branch

```bash
git checkout -b feature/your-feature
```

## Make your changes

Test the extension locally using Chrome's:

```text
chrome://extensions/
```

## Commit your changes

```bash
git add .
git commit -m "feat: add your feature"
```

## Push the branch

```bash
git push origin feature/your-feature
```

Then open a Pull Request.

---

# 📜 License

This project is currently available under the license specified in the repository.

If you intend to make the project open source, add an appropriate license file such as:

```text
LICENSE
```

---

# 👨‍💻 Author

## Darshan Ningappa Nandagavi

**Full Stack Developer | MERN | AI/ML**

<p align="left">
  <a href="https://darshannandagavi.vercel.app/">
    <img src="https://img.shields.io/badge/Portfolio-Visit-7C3AED?style=for-the-badge" alt="Portfolio">
  </a>
  <a href="https://github.com/Darshannandagavi">
    <img src="https://img.shields.io/badge/GitHub-Visit-181717?style=for-the-badge&logo=github" alt="GitHub">
  </a>
  <a href="https://linkedin.com/in/darshan-nandagavi">
    <img src="https://img.shields.io/badge/LinkedIn-Connect-0A66C2?style=for-the-badge&logo=linkedin" alt="LinkedIn">
  </a>
</p>

---

# ⭐ Friday

<p align="center">

```text
┌──────────────────────────────────────────────┐
│                                              │
│       F R I D A Y                            │
│                                              │
│       Your AI assistant inside Chrome.       │
│                                              │
└──────────────────────────────────────────────┘
```

**An AI assistant that lives where you work.**

</p>

---

<p align="center">
  Built with JavaScript, Chrome APIs, Web Audio, and Google Gemini.
</p>