# Privacy Policy

**Effective Date:** February 19, 2026

RageBaiter is a Chrome extension that helps users recognize political bias and logical fallacies on Twitter/X through Socratic questioning and political vector analysis. This privacy policy explains what data we collect, how we use it, and your rights regarding your information.

## 1. Data We Collect

We collect the following data to provide our service:

### Tweet Text (for Analysis)

When you view tweets on Twitter/X, the extension may send tweet text to our backend for political bias and logical fallacy analysis. This includes the visible text content of tweets that appear in your feed.

### Political Vector (Quiz Answers)

You can optionally take a political compass quiz to establish your political vector. We store your quiz answers as a 3D vector (social, economic, populist) to personalize interventions. This vector represents your political positioning in a normalized coordinate system.

### Feedback on Interventions

When we show a Socratic intervention popup, you can provide feedback by clicking "Good Point," "I Agree with Tweet," or "Dismiss." We record this feedback to improve detection accuracy and to adjust your political vector over time.

### Analyzed Tweet Cache

To improve performance and reduce costs, we cache analysis results for tweets. The cache includes tweet text, assigned political vectors, detected fallacies, topic classification, and analysis timestamp.

## 2. Data We Do NOT Collect

RageBaiter does not collect or store:

- **Browsing History** beyond Twitter/X pages where the extension is active
- **Personal Identity Information** such as your name, email address, phone number, or real-world location
- **Twitter Credentials** including login tokens, passwords, or session cookies
- **Twitter User IDs** or account handles
- **Engagement Metrics** like likes, retweets, or replies
- **Non-political Content** that fails our keyword filter

## 3. How We Use Your Data

We use the collected data exclusively to:

- Detect political bias and logical fallacies in tweets
- Compare tweet vectors against your political vector to identify echo-chamber content
- Generate Socratic questions that encourage critical thinking
- Improve the accuracy of our political bias detection algorithms
- Update your political vector based on your feedback (this creates a personalized experience over time)

We do not use your data for advertising, profiling for third parties, or any purpose outside of powering the RageBaiter extension.

## 4. Data Storage

### Backend Database

Your data is stored in Supabase, a PostgreSQL database hosted in the United States. The database is protected with row-level security policies that ensure users can only access their own data.

### Local Storage

Extension settings, your political vector, and quiz answers are stored locally in your browser using Chrome's storage API. This data remains on your device unless you explicitly sync it to our backend.

### Analyzed Tweet Cache

Tweet analysis results are cached in our database with a 24-hour expiration time. After 24 hours, cached results are purged and tweets must be re-analyzed.

## 5. Data Retention

- **Analyzed Tweets:** Cached for up to 24 hours to improve performance and reduce API costs. Expired cache entries are automatically deleted.
- **User Political Vector and Feedback:** Retained indefinitely unless you choose to delete them. We need this data to provide personalized interventions.
- **Quiz Responses:** Stored alongside your user profile to track your political vector over time.

You can delete all your data at any time through the extension settings. This will remove your political vector, feedback history, and quiz responses from our database.

## 6. Third-Party Services

We use the following third-party services to operate RageBaiter:

### Google Gemini API

Tweet text is sent to Google Gemini for political vector analysis and logical fallacy detection. Google processes this data according to their privacy policy. We send only the tweet text for analysis, no user identifiers or personal information.

### Supabase

Supabase provides our PostgreSQL database infrastructure. Data is stored in their US-hosted instances and protected by their security measures. Supabase has access to the database but cannot access your individual user data due to row-level security policies.

### Optional: User-Provided LLM APIs

If you choose to connect your own OpenAI, Anthropic, or Perplexity subscription, your API keys are stored locally on your device using Chrome's secure storage. These keys are never sent to our backend servers.

## 7. User Rights

You have the following rights regarding your data:

### Export Data

You can export all data associated with your installation through the extension settings. This includes your political vector, quiz responses, and feedback history. The export is provided as a JSON file.

### Delete Data

You can permanently delete all your data from our database through the extension settings. This action cannot be undone and will reset your political vector and feedback history.

### Access and Correction

You can view your current political vector and feedback history in the extension's debug panel. You may retake the quiz to update your vector at any time.

### GDPR and CCPA Compliance

RageBaiter is designed to comply with GDPR and CCPA requirements. The rights above align with data subject rights under these regulations. If you need additional assistance exercising these rights, contact us at the email address below.

## 8. Security

We implement industry-standard security measures:

- All communication between the extension and our backend is encrypted via HTTPS
- Database connections use TLS encryption
- Row-level security policies ensure users can only access their own data
- API keys are stored locally using Chrome's secure storage API
- User-provided LLM keys are never transmitted to our servers

## 9. Children's Privacy

RageBaiter is not directed to children under 13. We do not knowingly collect personal information from children. If you are a parent or guardian and believe your child has provided us with personal information, please contact us immediately.

## 10. Changes to This Policy

We may update this privacy policy from time to time. We will notify users of any material changes by posting a new version on our website and updating the effective date at the top of this document.

## 11. Contact Us

If you have questions about this privacy policy or your data, please contact us at:

**Email:** privacy@ragebaiter.com

---

**Last Updated:** February 19, 2026
