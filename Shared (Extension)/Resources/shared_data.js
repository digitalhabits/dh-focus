// shared_data.js
//
// Created by Ulrik Lyngs on 10/06/2025.

// Shared list of platforms the extension has specific toggles for.
const platformsWeTarget = ["youtube", "facebook", "x", "instagram", "linkedin", "whatsapp", "google", "reddit"];

// List of specific Google domains to target
const platformHostnames = {
    "youtube": ["www.youtube.com", "m.youtube.com"],
    "facebook": ["www.facebook.com", "m.facebook.com"],
    "x": ["x.com", "twitter.com"],
    "instagram": ["www.instagram.com"],
    "linkedin": ["www.linkedin.com"],
    "whatsapp": ["web.whatsapp.com"],
    "reddit": ["www.reddit.com", "reddit.com"],
    "google": [
        "www.google.com", "www.google.co.jp", "www.google.co.uk", "www.google.es",
        "www.google.ca", "www.google.de", "www.google.it", "www.google.fr",
        "www.google.com.au", "www.google.com.tw", "www.google.nl", "www.google.com.br",
        "www.google.com.tr", "www.google.be", "www.google.com.gr", "www.google.co.in",
        "www.google.com.mx", "www.google.dk", "www.google.com.ar", "www.google.ch",
        "www.google.cl", "www.google.at", "www.google.co.kr", "www.google.ie",
        "www.google.com.co", "www.google.pl", "www.google.pt", "www.google.com.pk"
    ]
};

// Shared list of all predefined elements that can be hidden across all targeted platforms.
const elementsThatCanBeHidden = [
    // YouTube
    "youtubeSearch", "youtubeSearchPredict", "youtubeRecVids", "youtubePlayables", "youtubeThumbnails", "youtubeNotifications", "youtubeProfileImg",
    "youtubeShorts", "youtubeSubscriptions", "youtubeYou", "youtubeHistory", "youtubeExplore", "youtubeMore",
    "youtubeRelated", /* "youtubeSidebar", */ "youtubeComments", "youtubeViews", "youtubeLikes", "youtubeSubscribers",
    // X (Twitter)
    "xExplore", "xNotifications", "xNews", "xTrends", "xFollow", "xTimeline",
    // Facebook
    "facebookStories", "facebookReels", "facebookSuggestedFollows", "facebookFeed", "facebookContacts", "facebookGroupChats", "facebookNotifications", "facebookNotificationBadges", "facebookOpenApp",
    // LinkedIn
    "linkedinNews", "linkedinNotifications", "linkedinFeed",
    // Instagram
    "instagramFeed", "instagramSearchFeed", "instagramStories", "instagramMutedStories", "instagramExplore", "instagramReels", "instagramSuggestedFollows", "instagramComments", "instagramNotificationBadges",
    // WhatsApp
    "whatsappPreview", "whatsappStatus", "whatsappChannels", "whatsappCommunities", "whatsappArchived", "whatsappProfilePictures", "whatsappNotificationPrompt",
    // Google
    "googleBackground", "googleAIOverview",
    // Reddit
    "redditFeed", "redditLeftSidebar", "redditPopular", "redditRecent", "redditCommunities", "redditNotification", "redditChat", "redditRelated", "redditBestOf", "redditRightSidebar"
];
