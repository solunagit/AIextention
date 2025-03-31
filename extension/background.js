// Listen for the browser action click
chrome.action.onClicked.addListener(async (tab) => {
  // Check if we can access the tab
  if (!tab.url.startsWith('chrome://') && !tab.url.startsWith('edge://')) {
    try {
      // First, ensure the content script is injected
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });

      // Then send the message
      chrome.tabs.sendMessage(tab.id, { action: "toggleSidebar" }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Failed to send message:', chrome.runtime.lastError);
        }
      });
    } catch (err) {
      console.error('Failed to inject content script:', err);
    }
  }
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "analyzeContent") {
    // Call OpenAI API with the content
    fetchFromOpenAI(request.content, request.prompt)
      .then(response => {
        sendResponse({ success: true, data: response });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true; // Indicates we want to use sendResponse asynchronously
  }
});

// Function to call OpenAI API
async function fetchFromOpenAI(content, prompt) {
  // Hardcoded API key (replace 'your-api-key-here' with your actual OpenAI API key)
  const apiKey = 'your-api-key-here';
  // Construct the message to send to OpenAI
  const messages = [
    { role: "system", content: "You are a helpful AI assistant that provides information about web pages." },
    { role: "user", content: `${prompt || "Summarize this page"}: ${content}` }
  ];

  // Call OpenAI API
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "gpt-4o-mini-2024-07-18",
      messages: messages,
      max_tokens: 500
    })
  });

  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.error?.message || "Failed to get response from OpenAI");
  }

  return data.choices[0].message.content;
}