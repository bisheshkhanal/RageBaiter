# Chrome Web Store Listing

## Short Description

(132 characters maximum)

Detect political echo chambers and logical fallacies on Twitter/X with AI-powered Socratic interventions.

---

## Full Description

RageBaiter helps you break out of political echo chambers by detecting bias and logical fallacies in your Twitter/X feed.

### How It Works

1. **Take the Quiz**: Start with an 18-question political compass quiz to establish your political vector across three dimensions (social, economic, populist).

2. **Monitor Your Feed**: RageBaiter passively watches your Twitter/X timeline as you scroll, identifying political content using a local keyword filter.

3. **Analyze Tweets**: Political tweets are sent to our backend for analysis. We use AI to:
   - Calculate the tweet's political vector
   - Detect logical fallacies (strawman, ad hominem, appeal to authority, etc.)
   - Classify the topic (immigration, healthcare, taxation, etc.)

4. **Compare Vectors**: We measure the distance between your political vector and each tweet's vector. If a tweet closely aligns with your views and contains fallacies, you're in an echo chamber moment.

5. **Get Socratic Interventions**: When we detect echo-chamber content, we show a Socratic question designed to encourage critical thinking. You can acknowledge the point, agree with the tweet, or dismiss it.

6. **Refine Your Profile**: Your feedback updates your political vector over time, making interventions more accurate and personalized.

### Key Features

- **Real-Time Analysis**: Tweets are analyzed as they appear in your feed, with caching for viral content to reduce costs and latency.
- **Privacy-First Design**: No browsing history tracking, no personal identity collection, no Twitter credentials stored. All sensitive data stays on your device.
- **Visual Interventions**: Color-coded tweet borders highlight potential echo-chamber content. Yellow for critical, orange for medium.
- **Debug Dashboard**: View the decision tree for every analyzed tweet in the side panel. Understand why interventions were triggered.
- **User-Controlled Learning**: Use your own LLM subscription (OpenAI, Anthropic, Perplexity) for Socratic questions, or use our templates. Your API keys never leave your device.

### What We Collect

- **Tweet Text**: Sent to Google Gemini for political bias and fallacy analysis
- **Quiz Answers**: Stored as a 3D vector (social, economic, populist) to personalize interventions
- **Feedback**: Your responses to interventions (acknowledged, agreed, dismissed) to improve detection accuracy
- **Analyzed Tweets**: Cached for 24 hours to improve performance for popular content

### What We Do NOT Collect

- Your browsing history outside Twitter/X
- Personal identity information (name, email, phone, location)
- Twitter login credentials, tokens, or session cookies
- Your Twitter username or user ID
- Engagement metrics (likes, retweets, replies)

### Privacy Assurance

RageBaiter is built with privacy as a core principle:

- All user data is stored in Supabase with row-level security
- Database hosted in the United States with TLS encryption
- API keys stored locally using Chrome's secure storage
- No advertising, no third-party data sharing, no profiling

You can export or delete all your data at any time through the extension settings. See our full privacy policy for details.

### Who Should Use RageBaiter

RageBaiter is for anyone who wants to:

- Develop better critical thinking skills
- Recognize when they're consuming bias-confirming content
- Understand political arguments from different perspectives
- Learn to spot logical fallacies in political discourse

This tool is not about changing your political views. It's about helping you understand why you believe what you believe, and ensuring you're exposed to accurate, well-reasoned arguments rather than emotionally manipulative content.

### Technical Details

- **Permissions**: `activeTab`, `storage`, `sidePanel`, host permissions for twitter.com and x.com
- **Architecture**: Manifest V3 Chrome extension with React UI and Hono backend
- **Analysis Engine**: Google Gemini API for political vector calculation and fallacy detection
- **Database**: PostgreSQL with pgvector extension for similarity search
- **Auth**: Supabase email/password authentication

### Limitations

- RageBaiter only works on Twitter/X. Support for other platforms is planned.
- Analysis is based on the visible tweet text only. Images, videos, and linked content are not analyzed.
- The political vector system is a simplified model and cannot capture the full complexity of political beliefs.
- LLM analysis may produce false positives or miss nuanced arguments. Use Socratic questions as a starting point for reflection, not a definitive judgment.

### Feedback & Support

We're continuously improving RageBaiter. If you encounter bugs, have feature requests, or want to report a misdetected tweet, please reach out:

**Support Email**: support@ragebaiter.com

**Homepage**: https://ragebaiter.com

**Privacy Policy**: https://ragebaiter.com/privacy

Thank you for using RageBaiter and for committing to better critical thinking.

---

## Store Metadata

### Category

**Productivity** or **Social & Communication**

_Recommendation: Productivity, as the tool helps users process information more effectively rather than facilitating social communication._

### Language

English

### Screenshots List

Capture the following screenshots (1280x800 or 640x400 recommended):

1. **Intervention Popup on Twitter/X**
   - Show a tweet with the yellow border indicating echo-chamber detection
   - The Socratic question popup overlay should be visible
   - Include the feedback buttons (Good Point, I Agree with Tweet, Dismiss)

2. **Political Compass Quiz**
   - Show the quiz question card in the side panel
   - Display the progress bar
   - Include the 5-point Likert scale (Strongly Disagree to Strongly Agree)

3. **Quiz Results Screen**
   - Show the user's vector placement
   - Include any visual representation of where they fall on the political compass

4. **Debug Panel - Decision Log**
   - Show the real-time decision tree for analyzed tweets
   - Include several log entries showing topic, vectors, distance, fallacies, and decision

5. **Vector Visualization Dashboard**
   - Show the 3D or 2D visualization of the user's political vector
   - Include reference points or axis labels

6. **Extension Badge/Popup**
   - Show the extension icon in the Chrome toolbar
   - Display the popup menu with quick actions (settings, quiz, debug panel)

7. **Settings Panel**
   - Show the LLM configuration section
   - Display site toggles (Twitter/X enabled/disabled)
   - Include sensitivity threshold sliders

8. **Site Toggle in Action**
   - Show the toggle switches in settings
   - Demonstrate the extension badge indicating active/inactive state

### Promotional Tile Copy

(440x280 pixels, minimal text)

**Suggested Tagline**:

"Break Out of Echo Chambers
AI-Powered Political Bias Detection"

**Alternative Taglines**:

- "See Beyond Your Bias"
- "Critical Thinking for Twitter/X"
- "Detect Fallacies. Think Deeper."

### Contact & URLs

| Field              | Value                          |
| ------------------ | ------------------------------ |
| Support Email      | support@ragebaiter.com         |
| Homepage URL       | https://ragebaiter.com         |
| Privacy Policy URL | https://ragebaiter.com/privacy |

---

## Review Checklist

Before submitting to the Chrome Web Store:

- [ ] Short description is under 132 characters
- [ ] Full description clearly explains what the extension does
- [ ] Screenshots are properly sized and show key features
- [ ] Privacy section is accurate and complete
- [ ] Support email is valid and monitored
- [ ] Homepage URL points to a real website
- [ ] Privacy policy URL points to a real policy page
- [ ] Category is appropriate (Productivity or Social & Communication)
- [ ] Language is set to English
- [ ] No misleading claims or promises
- [ ] Terms of use are included if applicable
- [ ] Permissions are justified and explained
