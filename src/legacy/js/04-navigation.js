/* ---------- NAVIGATION ---------- */
/* ---------- MODE LECTURE SEULE PENDANT UN EXAMEN ---------- */
let examInProgress = false;
function setExamLockMode(locked){
  examInProgress = locked;
  const tabbar = document.getElementById('tabbar');
  const livesBtn = document.getElementById('global-lives-btn');
  const searchBtn = document.getElementById('global-search-btn');
  const notifBtn = document.getElementById('global-notif-btn');
  const backBtn = document.getElementById('take-exam-back-btn');
  if(tabbar) tabbar.style.display = locked ? 'none' : 'flex';
  if(livesBtn) livesBtn.style.display = locked ? 'none' : 'flex';
  if(searchBtn) searchBtn.style.display = locked ? 'none' : 'flex';
  if(notifBtn) notifBtn.style.display = locked ? 'none' : 'flex';
  if(backBtn) backBtn.style.display = locked ? 'none' : 'inline-block';
}
function setAdminTab(tab){
  document.querySelectorAll('.admin-tab-content').forEach(el => {
    el.style.display = el.dataset.tab === tab ? 'block' : 'none';
  });
  document.querySelectorAll('.admin-tab-btn').forEach(btn => {
    const isActive = btn.dataset.tab === tab;
    btn.style.background = isActive ? 'var(--coral)' : 'transparent';
    btn.style.color = isActive ? 'var(--night)' : 'var(--cream)';
  });
}
function go(screen){
  checkMaintenanceMode(screen);
  if(examInProgress && screen !== 'take-full-exam'){
    showToast('🔒 Terminez et envoyez votre examen avant de naviguer ailleurs');
    return;
  }
  if(screen !== 'course-detail' && typeof stopLiveDocPolling === 'function') stopLiveDocPolling();
  if(screen !== 'course-detail' && typeof stopCourseChatPolling === 'function') stopCourseChatPolling();
  if(screen !== 'manage-course' && typeof stopManageCourseChatPolling === 'function') stopManageCourseChatPolling();
  if(screen !== 'course-group-chat' && typeof stopCourseGroupChatPolling === 'function') stopCourseGroupChatPolling();
  if(screen !== 'live-view' && !isLivePipActive && livePollRefreshInterval){ clearInterval(livePollRefreshInterval); livePollRefreshInterval = null; clearLiveViewerHeartbeat(); if(currentJitsiApi){ try{ currentJitsiApi.dispose(); }catch(e){} currentJitsiApi = null; } }
  if(screen !== 'penc-room' && pencRoomRefreshInterval){ clearInterval(pencRoomRefreshInterval); pencRoomRefreshInterval = null; }
  if(screen !== 'live-view' && liveTapLikeBuffer > 0){ if(liveTapLikeFlushTimer) clearTimeout(liveTapLikeFlushTimer); flushLiveTapLikes(); }
  if(screen !== 'camera-publish' && cameraPublishStream){ cameraPublishStream.getTracks().forEach(t => t.stop()); cameraPublishStream = null; if(cameraTimerHandle) clearInterval(cameraTimerHandle); }
  if(screen !== 'settings' && meetingWaitingRoomRefreshInterval){ clearInterval(meetingWaitingRoomRefreshInterval); meetingWaitingRoomRefreshInterval = null; }
  if(screen !== 'single-post' && autoplayCountdownInterval){ clearInterval(autoplayCountdownInterval); autoplayCountdownInterval = null; }
  if(screen !== 'live-battle' && battleRefreshInterval){ clearInterval(battleRefreshInterval); battleRefreshInterval = null; }
  if(screen !== 'live-activity-feed' && liveActivityRefreshInterval){ clearInterval(liveActivityRefreshInterval); liveActivityRefreshInterval = null; }
  const livesBtn = document.getElementById('global-lives-btn');
  const searchBtn = document.getElementById('global-search-btn');
  const notifBtn = document.getElementById('global-notif-btn');
  if(livesBtn) livesBtn.style.display = screen === 'onboarding' ? 'none' : 'flex';
  if(searchBtn) searchBtn.style.display = screen === 'onboarding' ? 'none' : 'flex';
  if(notifBtn) notifBtn.style.display = screen === 'onboarding' ? 'none' : 'flex';
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById('screen-' + screen);
  if(el) el.classList.add('active');
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.screen === screen));
  if(screen === 'feed'){ checkGuestBrowsingExpiry(); renderFeed(); checkAnnouncementBanner(); checkZoneCampaignBanner(); checkWeeklyTrendBanner(); applyFeatureFlags(); checkLivesBanner(); refreshNotifBadge(); checkOfficialStatementBanner(); renderStoriesBar(); checkMemories(); checkNewlyReleasedEpisodes(); checkScheduledSystemNotifications(); }
  if(screen === 'notifications') renderNotifications();
  if(screen === 'seller-dashboard') renderSellerDashboard();
  if(screen === 'education-hub') renderEducationHub();
  if(screen === 'my-learning') renderMyLearning();
  if(screen === 'my-subscriptions') renderMySubscriptions();
  if(screen === 'activity-log') renderActivityLog();
  if(screen === 'my-notes') renderMyNotes();
  if(screen === 'my-sanctions') renderMySanctions();
  if(screen === 'missed-lives') renderMissedLives();
  if(screen === 'theme-manager') renderThemeManager();
  if(screen === 'privacy-settings') renderBlockedAccountsList();
  if(screen === 'my-qr-code'){ safeGet('user:' + currentUser, true).then(me => renderReferralCard(me)); }
  if(screen === 'my-engagement'){ renderDailyStreakCard(); renderContentGoalCard(); }
  if(screen === 'global-audit'){ renderGlobalAuditLog(); renderCriticalAlertsPanel(); }
  if(screen === 'exceptions-registry') renderExceptionsRegistry();
  if(screen === 'dg-config-menu'){ if(!isGenuineOwnerSession){ showToast('Réservé au propriétaire'); go('admin'); } }
  if(screen === 'official-news') renderOfficialNewsFeed();
  if(screen === 'local-directory') renderLocalDirectory();
  if(screen === 'community-events') renderCommunityEventsList();
  if(screen === 'polls') renderPollsList();
  if(screen === 'resource-library') renderResourceLibraryList();
  if(screen === 'my-agenda') renderMyAgenda();
  if(screen === 'wishlist') renderWishlistScreen();
  if(screen === 'feature-votes') renderFeatureVotesList();
  if(screen === 'cart') renderCartScreen();
  if(screen === 'my-orders') renderMyOrdersScreen();
  if(screen === 'vocab-notebook') renderVocabNotebook();
  if(screen === 'music-library'){ renderMusicLibrary(); renderMusicTrending(); renderRecommendedSounds(); }
  if(screen === 'image-library') renderTeachingImageLibrary();
  if(screen === 'my-playlists') renderMyPlaylists();
  if(screen === 'watch-history') renderWatchHistory();
  if(screen === 'my-story-questions') renderMyStoryQuestions();
  if(screen === 'profile-visitors'){ loadPrivateBrowsingToggle(); renderProfileVisitors(); }
  if(screen === 'institutional-corner') renderInstitutionalCorner();
  if(screen === 'series-list'){ renderSeriesWeeklyRanking(); renderPublicSeriesList(); }
  if(screen === 'my-service-bookings') renderMyServiceBookings();
  if(screen === 'seller-service-bookings') renderSellerServiceBookings();
  if(screen === 'students-leaderboard') renderStudentsLeaderboard();
  if(screen === 'challenges') renderChallengesList();
  if(screen === 'publish'){ renderPublishChallengeBanner(); restoreCaptionDraft(); renderVideoReplyBanner(); renderAddYoursBanner(); loadSeriesPartOptions(); loadDefaultCommentRestrictionForPublish(); }
  if(screen === 'seller-leaderboard') renderSellerLeaderboard();
  if(screen === 'exam-prep') renderExamPrepList();
  if(screen === 'parent-space') renderParentSpace();
  if(screen === 'parent-requests-received') renderStudentParentRequests();
  if(screen === 'become-trainer') prefillTrainerPhotoIfAvailable();
  if(screen === 'education-courses') renderEducationCourses();
  if(screen === 'trainer-dashboard') renderTrainerDashboard();
  if(screen === 'live-invite') renderLiveInvitePicker();
  if(screen === 'settings') renderSettingsScreen();
  if(screen === 'manage-comments-list') renderManageCommentsList();
  if(screen === 'manage-topics') renderManageTopicsList();
  if(screen === 'shared-feed' && !currentSharedFeedPartner) go('messages');
  if(screen === 'coin-wallet'){ renderCoinWallet(); renderMyWithdrawalRequests(); }
  if(screen === 'camera-publish') openCameraPublish();
  if(screen === 'payout-specialist'){ renderPayoutSpecialistList(); renderCoinWithdrawalSpecialistList(); }
  if(screen === 'coin-revenue-dashboard') renderCoinRevenueDashboard();
  if(screen === 'finance-dashboard'){ if(!isGenuineOwnerSession){ showToast('Réservé au propriétaire'); go('admin'); } else { renderFinanceDashboard(); } }
  if(screen === 'inactive-users'){ if(!isGenuineOwnerSession){ showToast('Réservé au propriétaire'); go('admin'); } else { renderInactiveUsersList(); } }
  if(screen === 'zone-controller'){ if(!isGenuineOwnerSession){ showToast('Réservé au propriétaire'); go('admin'); } else { renderZoneControllerList(); } }
  if(screen === 'sfx-library'){ if(!isGenuineOwnerSession){ showToast('Réservé au propriétaire'); go('admin'); } else { renderSfxLibrary(); renderAdminTrendingSounds(); renderAdminRoyaltyTracking(); } }
  if(screen === 'admin-media-library'){ if(!isGenuineOwnerSession){ showToast('Réservé au propriétaire'); go('admin'); } else { renderAdminMediaLibrary(); } }
  if(screen === 'admin-service-calendar'){ if(!isGenuineOwnerSession){ showToast('Réservé au propriétaire'); go('admin'); } else { renderAdminServiceCalendar(); } }
  if(screen === 'audience-demographics'){ if(!isGenuineOwnerSession){ showToast('Réservé au propriétaire'); go('admin'); } else { renderAudienceDemographics(); } }
  if(screen === 'platform-identity-settings'){ if(!isGenuineOwnerSession){ showToast('Réservé au propriétaire'); go('admin'); } else { renderPlatformIdentitySettings(); } }
  if(screen === 'creator-partnerships'){ if(!isGenuineOwnerSession){ showToast('Réservé au propriétaire'); go('admin'); } else { renderCreatorPartnerships(); } }
  if(screen === 'supplier-partnerships'){ if(!isGenuineOwnerSession){ showToast('Réservé au propriétaire'); go('admin'); } else { renderSupplierPartnerships(); } }
  if(screen === 'creator-studio'){ renderCreatorStatsCard(); renderCreatorGrowthTrend(); renderCreatorLevelCard(); }
  if(screen === 'about-suktum') renderAboutSuktum();
  if(screen === 'buyer-pattern-review'){ if(!isGenuineOwnerSession){ showToast('Réservé au propriétaire'); go('admin'); } else { renderBuyerPatternReview(); } }
  if(screen === 'institutional-dashboard'){ if(!isGenuineOwnerSession){ showToast('Réservé au propriétaire'); go('admin'); } else { renderInstitutionalDashboard(); } }
  if(screen === 'my-disputes') renderMyDisputes();
  if(screen === 'wisdom-capsules') renderWisdomCapsulesScreen();
  if(screen === 'ebook-library') renderEbookLibrary();
  if(screen === 'conference-attendance-history') renderConferenceAttendanceHistory();
  if(screen === 'my-education-calendar') renderMyEducationCalendar();
  if(screen === 'disputes-against-me') renderDisputesAgainstMe();
  if(screen === 'seller-ledger'){ if(!isGenuineOwnerSession){ showToast('Réservé au propriétaire'); go('admin'); } else { renderSellerLedger(); } }
  if(screen === 'my-bug-reports') renderMyBugReports();
  if(screen === 'sound-picker') renderSoundPicker();
  if(screen === 'smart-cut') renderSmartCutSoundList();
  if(screen === 'schedule-calendar'){ selectedScheduleDay = null; renderScheduleCalendar(); }
  if(screen === 'discover'){ renderDiscover(); renderSuggestedAccounts(); renderDiscoverSearchResults(); renderDailyContent(); renderFeaturedCreatorOfMonth(); renderTrendingHashtagsGrowth(); }
  if(screen === 'community-groups') renderCommunityGroupsList();
  if(screen === 'automation-control-center') renderAutomationControlCenter();
  if(screen === 'admin-login-log') renderAdminLoginLog();
  if(screen === 'commission-history') renderCommissionHistory();
  if(screen === 'country-comparison') renderCountryComparison();
  if(screen === 'recurring-tasks') renderRecurringTasks();
  if(screen === 'important-alerts') renderImportantAlerts();
  if(screen === 'internal-changelog') renderInternalChangelog();
  if(screen === 'decision-log') renderDecisionLog();
  if(screen === 'duplicate-accounts') renderDuplicateAccounts();
  if(screen === 'content-country-restriction') renderCountryRestrictionRecentPosts();
  if(screen === 'my-fund-payouts') renderMyFundPayouts();
  if(screen === 'blocked-users-list') renderBlockedUsersList();
  if(screen === 'seller-shop-view') renderSellerShopView();
  if(screen === 'ai-confidence-queue') renderAiConfidenceQueue();
  if(screen === 'audience-insights') renderAudienceInsights();
  if(screen === 'knowledge-base') renderKnowledgeBase();
  if(screen === 'oncall-roster') renderOnCallRoster();
  if(screen === 'ab-testing') renderABTestsList();
  if(screen === 'dev-tasks') renderDevTasks();
  if(screen === 'ai-tech-agent') renderAITechAgentReport();
  if(screen === 'admin') renderSatisfactionSummary();
  if(screen === 'techteam-home'){
    const welcomeEl = document.getElementById('techteam-welcome-title');
    if(welcomeEl) welcomeEl.textContent = '👋 Bonjour ' + (currentTechTeamName || '');
    const logoEl = document.getElementById('techteam-header-logo');
    if(logoEl) logoEl.src = effectivePlatformLogo;
    startAdminSessionValidityWatch();
  }
  if(screen === 'command-center') renderCommandCenter();
  if(screen === 'region-presence-map') renderRegionPresenceMap();
  if(screen === 'disputes-region-map') renderDisputesRegionMap();
  if(screen === 'video-drafts-library') renderVideoDraftsLibrary();
  if(screen === 'affiliate-partnerships') renderAffiliatePartnershipsList();
  if(screen === 'cagnottes-browse') renderCagnottesBrowse();
  if(screen === 'price-negotiation') renderPriceNegotiation();
  if(screen === 'wanted-listings') renderWantedListingsBrowse();
  if(screen === 'auction-detail') renderAuctionDetail();
  if(screen === 'seller-ai-coach') renderSellerAICoachReport();
  if(screen === 'grouped-delivery') renderGroupedDelivery();
  if(screen === 'voice-call-history') renderVoiceCallHistory();
  if(screen === 'screen-time-settings') loadScreenTimeSettingsForm();
  if(screen === 'my-negotiations') renderMyNegotiations();
  if(screen === 'collab-playlists-browse') renderCollabPlaylistsBrowse();
  if(screen === 'trending-sounds') renderTrendingSounds();
  if(screen === 'sound-detail') renderSoundDetailPage();
  if(screen === 'product-comparator'){ comparatorSelectedIds = []; renderComparatorTable(); }
  if(screen === 'recently-viewed') renderRecentlyViewed();
  if(screen === 'nearby-sellers') renderNearbySellers();
  if(screen === 'editorial-calendar') renderEditorialCalendar();
  if(screen === 'meeting-history') renderMeetingHistory();
  if(screen === 'penc-stats') renderPencStats();
  if(screen === 'live-chat-transcripts') renderLiveChatTranscriptsList();
  if(screen === 'missed-content') renderMissedContent();
  if(screen === 'moderation-history') renderModerationHistory();
  if(screen === 'penc-browse'){ renderPencBrowse(); renderPencTopicVotesList(); }
  if(screen === 'creator-vote') renderCreatorVoteList();
  if(screen === 'learning-paths') renderLearningPathsBrowse();
  if(screen === 'my-affiliate-partnerships') renderMyAffiliatePartnerships();
  if(screen === 'team-leaderboard'){ renderTeamLeaderboard(); renderTeamRecognitionList(); }
  if(screen === 'live-activity-feed'){
    renderLiveActivityFeed();
    if(liveActivityRefreshInterval) clearInterval(liveActivityRefreshInterval);
    liveActivityRefreshInterval = setInterval(renderLiveActivityFeed, 5000);
  }
  if(screen === 'shop'){ renderShop(); renderFeaturedProductsCarousel(); renderTopSellersCarousel(); renderNearbySellersCarousel(); }
  if(screen === 'messages'){ renderMessagesList(); renderMyGroupsList(); }
  if(screen === 'group-create') renderGroupMemberPicker();
  if(screen === 'group-members') renderGroupMembersScreen();
  if(screen === 'profile') renderProfile();
  if(screen === 'admin-login') loadAdminLoginScreen();
  if(screen === 'admin') loadAdminDashboard();
  if(screen === 'support') loadMyTickets();
  if(screen === 'favorites') renderFavorites();
  if(screen === 'watch-later') renderWatchLaterList();
  if(screen === 'following-list') renderFollowingList();
  if(screen === 'followers-list') renderFollowersList();
  if(screen === 'user-profile') renderUserProfile();
  if(screen === 'hashtag-page') renderHashtagPage();
  if(screen === 'comments') renderCommentsScreen();
}

