/*
  Peerly — i18n.js
  English / Burmese text. Add a key to both languages, then use it in HTML with
  data-i18n="key" (text) or data-i18n-ph="key" (placeholder), or in JS with t('key').
  {name}-style placeholders are filled in by t('key', {name: 'Aye Min'}).
*/
const I18N = {
  en: {
    'nav.home': 'Home', 'nav.groups': 'Groups', 'nav.people': 'People', 'nav.messages': 'Messages',
    'nav.sessions': 'Sessions', 'nav.admin': 'Admin', 'nav.lang': 'မြန်မာ', 'nav.join': 'Join free',
    'nav.back': 'Back', 'nav.profile': 'My Profile', 'nav.logout': 'Log Out', 'nav.me': 'Me',

    'home.eyebrow': 'For Myanmar people everywhere — and soon, the world',
    'home.title': 'Make friends. Learn together. Swap skills.',
    'home.sub': 'Peerly is a warm, free community where you meet people like you, join groups, ask questions and teach each other what you know.',
    'home.cta': "Join Peerly — it's free", 'home.cta2': 'See live rooms',
    'home.live': 'Happening now on Peerly', 'home.how': 'What you can do on Peerly',
    'home.members': 'members', 'home.groupsN': 'groups', 'home.postsN': 'posts',
    'how.feed.t': 'Share in the feed', 'how.feed.d': "Post what you're learning, ask questions, share wins and photos. Like and comment on others' posts.",
    'how.groups.t': 'Join groups', 'how.groups.d': 'Burmese in Finland, English learners, Tech & coding and more — or start your own group.',
    'how.swap.t': 'Swap skills 1-to-1', 'how.swap.d': 'Find someone who teaches what you want to learn, and teach them back. No money, just knowledge.',
    'how.msg.t': 'Message & make friends', 'how.msg.d': 'Chat privately with people you meet in groups. Friendships first, learning follows.',
    'how.sess.t': 'Schedule sessions', 'how.sess.d': 'Book video calls or meetups with an agenda, then rate each other to build trust.',
    'how.lang.t': 'English & မြန်မာ', 'how.lang.d': 'Use Peerly in English or Burmese — switch any time from the menu.',

    'feed.all': 'Everyone', 'feed.mine': 'My groups', 'feed.more': 'Load more',
    'feed.empty': 'No posts yet. Be the first to say hello 👋',
    'feed.emptyMine': "Nothing from your groups yet. Join a few groups or write the first post!",
    'feed.end': "You're all caught up ✨",
    'comp.ph': "What's on your mind, {name}?", 'comp.phGroup': 'Write something to {group}…',
    'comp.guest': 'Join Peerly to post, comment and meet people.',
    'comp.photo': 'Photo', 'comp.post': 'Post', 'comp.posting': 'Posting…', 'comp.where': 'Post to',
    'comp.everyone': 'Everyone (no group)',
    'post.like': 'Like', 'post.comment': 'Comment', 'post.delete': 'Delete',
    'post.confirmDelete': 'Delete this post?', 'post.in': 'in',
    'post.likes': '{n} likes', 'post.comments': '{n} comments',
    'cmt.ph': 'Write a comment…', 'cmt.send': 'Send', 'cmt.none': 'No comments yet.',
    'side.mygroups': 'Your groups', 'side.people': 'People to meet', 'side.all': 'See all',
    'side.nogroups': "You haven't joined any groups yet.", 'side.find': 'Find groups',
    'side.say': 'Say hi',

    'groups.title': 'Groups', 'groups.sub': 'Find your people. Join a few groups to fill your feed.',
    'groups.create': '+ Create a group', 'groups.members': '{n} members', 'groups.member1': '1 member', 'groups.post1': '1 post', 'groups.posts': '{n} posts',
    'groups.join': 'Join', 'groups.joined': 'Joined ✓', 'groups.leave': 'Leave group',
    'groups.open': 'Open', 'groups.joinedToast': 'You joined {group} 🎉', 'groups.leftToast': 'You left {group}',
    'groups.delete': 'Delete group', 'groups.confirmDelete': 'Delete this group and all its posts?',
    'groups.empty': 'No posts in this group yet. Start the conversation!',
    'cg.title': 'Create a group', 'cg.sub': 'Bring people together around a place, a skill or an interest.',
    'cg.emoji': 'Icon', 'cg.name': 'Group name', 'cg.name.ph': 'e.g. Burmese in Oulu',
    'cg.desc': 'What is it about?', 'cg.desc.ph': "Who should join and what you'll talk about",
    'cg.btn': 'Create group', 'cg.short': 'Group name needs at least 3 characters',

    'onb.title': 'Join a few groups', 'onb.sub': 'Pick at least one. Their posts will show in your feed — you can change this any time.',
    'onb.done': 'Go to my feed', 'onb.pick': 'Pick at least one group 🙂', 'onb.welcome': 'Welcome to Peerly, {name}! 🎉',

    'br.title': 'Find people to learn with', 'br.sub': 'Discover people who can teach what you want to learn',
    'br.search': 'Search by skill or name…', 'br.all': 'Everyone', 'br.sugg': 'Suggested', 'br.online': 'Online Now',
    'br.video': 'Video Calls', 'br.inperson': 'In-Person',

    'pf.create': 'Create your profile', 'pf.mine': 'My Profile', 'pf.sub': 'Tell people a little about you and what you can share',
    'pf.photo': 'Add a photo', 'pf.name': 'Name', 'pf.bio': 'About you', 'pf.bio.ph': 'Where you live, what you do, what you love …',
    'pf.teach': 'Skills I can share', 'pf.learn': 'Skills I want to learn', 'pf.pref': 'How do you like to meet?',
    'pf.save': 'Save & continue', 'pf.saved': 'Profile saved!', 'pf.saved.msg': 'Looking good, {name}! Your profile is live.',

    'auth.in': 'Sign In', 'auth.up': 'Sign Up', 'auth.pass': 'Password', 'auth.create': 'Create Account',

    'toast.welcomeback': 'Welcome back, {name}! 👋', 'toast.created': 'Account created! Let’s set up your profile.',
    'toast.loggedout': 'Logged out. See you soon!', 'toast.loginFirst': 'Join Peerly first 🙂',
    'toast.tooBig': 'That photo is too big (max 6MB)',

    'nav.rooms': 'Rooms', 'side.rooms': 'Live rooms',
    'rooms.title': 'Rooms', 'rooms.sub': 'Watch together, study together or just hang out — with chat and voice.',
    'rooms.kind.watch': 'Watch together', 'rooms.kind.study': 'Study room', 'rooms.kind.hangout': 'Hangout',
    'rooms.kindd.watch': 'YouTube or your own video, synced', 'rooms.kindd.study': 'Shared focus timer + breaks', 'rooms.kindd.hangout': 'Voice chat with friends',
    'rooms.live': '{n} here', 'rooms.host': 'Host: {name}', 'rooms.noVideo': 'No video yet', 'rooms.videoReady': 'Video ready',
    'rooms.empty': 'No rooms yet. Start one and invite your friends!', 'rooms.start': 'Start a room',
    'rooms.notFound': 'This room was closed or does not exist.', 'rooms.joinToEnter': 'Join Peerly to enter the room 🙂',
    'rooms.closed': 'The host closed this room', 'rooms.share': 'Share link', 'rooms.close': 'Close room',
    'rooms.confirmClose': 'Close this room for everyone?', 'rooms.linkCopied': 'Room link copied — send it to your friends!',
    'rooms.reconnecting': 'Reconnecting…', 'rooms.chat': 'Chat', 'rooms.chatPh': 'Say something…', 'rooms.sayHi': 'Say hi 👋',
    'rooms.namePh.watch': 'e.g. Friday movie night', 'rooms.namePh.study': 'e.g. Exam week study', 'rooms.namePh.hangout': 'e.g. Late night chill',
    'cr.title': 'Start a room', 'cr.name': 'Room name', 'cr.url': 'YouTube link (optional)', 'cr.desc': 'Short note (optional)',
    'cr.descPh': 'e.g. Exam week — cameras optional', 'cr.group': 'Show it in', 'cr.btn': 'Open room',
    'watch.tapSync': 'Tap to join the video', 'watch.pastePh': 'Paste a YouTube link…', 'watch.play': 'Play for everyone',
    'watch.upload': 'Upload', 'watch.uploadHint': 'Upload an MP4/WebM you have the right to share (max 400 MB)',
    'watch.empty': 'Paste a YouTube link below to start watching together', 'watch.nothing': 'Nothing playing yet',
    'watch.uploaded': 'Uploaded video', 'watch.tooBig': 'Video is too large (max 400 MB)', 'watch.ytError': 'This video can\'t be played here (the owner may block embedding).',
    'watch.by.play': '{name} pressed play at {time}', 'watch.by.pause': '{name} paused at {time}', 'watch.by.seek': '{name} jumped to {time}', 'watch.by.video': '{name} changed the video',
    'study.focus': 'Focus', 'study.break': 'Break', 'study.start': 'Start', 'study.pause': 'Pause', 'study.skip': 'Skip',
    'study.focusHint': 'Phones down, mics muted. You\'ve got this.', 'study.breakHint': 'Stretch, chat, grab a drink ☕',
    'study.breakNow': '☕ Break time! Chat or stretch for a bit.', 'study.focusNow': '📚 Back to focus.',
    'study.by.start': '{name} started the timer', 'study.by.pause': '{name} paused the timer', 'study.by.reset': '{name} reset the timer',
    'study.by.skip': '{name} skipped to the next block', 'study.by.set': '{name} changed the timer',
    'hang.sub': 'Join the voice chat and hang out.',
    'call.joinVoice': 'Join voice', 'call.joinVideo': 'With camera', 'call.joinHang': 'Join the call', 'call.leave': 'Leave',
    'call.mic': 'Microphone', 'call.cam': 'Camera', 'call.screen': 'Share screen', 'call.you': 'you',
    'call.notSetUp': 'Calls aren\'t set up on this server yet', 'call.noMic': 'Could not use your microphone', 'call.noCam': 'Could not use your camera',
    'call.noScreen': 'Screen sharing isn\'t available on this device', 'call.failed': 'Could not join the call', 'call.tapAudio': 'Tap to hear the call',
    'call.with': 'Call with {name}', 'call.started': 'Started a voice call', 'call.videoStarted': 'Started a video call', 'call.join': 'Join',
    'call.ended': 'Call ended', 'rooms.lounge': 'Lounge', 'rooms.peerly': 'Peerly', 'call.incoming': 'is calling you…', 'call.incomingVideo': 'is video calling you…',
    'time.now': 'just now', 'time.m': '{n}m', 'time.h': '{n}h', 'time.d': '{n}d',
  },

  my: {
    'nav.home': 'ပင်မ', 'nav.groups': 'အုပ်စုများ', 'nav.people': 'လူများ', 'nav.messages': 'မက်ဆေ့ချ်',
    'nav.sessions': 'Session များ', 'nav.admin': 'Admin', 'nav.lang': 'English', 'nav.join': 'အခမဲ့ ဝင်ရောက်ရန်',
    'nav.back': 'နောက်သို့', 'nav.profile': 'ကျွန်ုပ်၏ ပရိုဖိုင်', 'nav.logout': 'ထွက်ရန်', 'nav.me': 'ကျွန်ုပ်',

    'home.eyebrow': 'ကမ္ဘာအနှံ့ရှိ မြန်မာများအတွက် — မကြာမီ ကမ္ဘာတစ်ဝှမ်းအတွက်',
    'home.title': 'သူငယ်ချင်းဖွဲ့ပါ။ အတူတူ လေ့လာပါ။ ကျွမ်းကျင်မှု ဖလှယ်ပါ။',
    'home.sub': 'Peerly ဟာ သင့်လိုလူတွေနဲ့ တွေ့ဆုံ၊ အုပ်စုတွေမှာ ပါဝင်၊ မေးခွန်းမေးပြီး သိတာတွေကို အပြန်အလှန် သင်ပေးနိုင်တဲ့ အခမဲ့ community တစ်ခုပါ။',
    'home.cta': 'Peerly ကို အခမဲ့ ဝင်ပါ', 'home.cta2': 'Live အခန်းများ ကြည့်ရန်',
    'home.live': 'Peerly မှာ အခု ဖြစ်နေတာတွေ', 'home.how': 'Peerly မှာ ဘာတွေ လုပ်နိုင်လဲ',
    'home.members': 'အဖွဲ့ဝင်', 'home.groupsN': 'အုပ်စု', 'home.postsN': 'ပို့စ်',
    'how.feed.t': 'Feed မှာ မျှဝေပါ', 'how.feed.d': 'လေ့လာနေတာတွေ၊ မေးခွန်းတွေ၊ အောင်မြင်မှုတွေနဲ့ ဓာတ်ပုံတွေ တင်ပါ။ တခြားသူတွေရဲ့ ပို့စ်ကို Like နဲ့ Comment ပေးပါ။',
    'how.groups.t': 'အုပ်စုများတွင် ပါဝင်ပါ', 'how.groups.d': 'ဖင်လန်ရောက် မြန်မာများ၊ အင်္ဂလိပ်စာ လေ့လာသူများ၊ နည်းပညာ စသည်ဖြင့် — ကိုယ်ပိုင်အုပ်စုလည်း ဖွဲ့နိုင်ပါတယ်။',
    'how.swap.t': 'တစ်ဦးချင်း ကျွမ်းကျင်မှု ဖလှယ်ပါ', 'how.swap.d': 'သင်လေ့လာချင်တာကို သင်ပေးနိုင်သူကို ရှာပြီး သင်ကလည်း ပြန်သင်ပေးပါ။ ပိုက်ဆံမလို၊ အသိပညာပဲ လိုပါတယ်။',
    'how.msg.t': 'စကားပြောပြီး သူငယ်ချင်းဖွဲ့ပါ', 'how.msg.d': 'အုပ်စုတွေမှာ တွေ့တဲ့သူတွေနဲ့ သီးသန့် စကားပြောပါ။ ခင်မင်မှု အရင်၊ လေ့လာမှု နောက်က လိုက်လာမယ်။',
    'how.sess.t': 'Session ချိန်းဆိုပါ', 'how.sess.d': 'Video call ဒါမှမဟုတ် လူချင်းတွေ့ဆုံမှုကို အစီအစဉ်နဲ့ ချိန်းပြီး အပြန်အလှန် အဆင့်သတ်မှတ်ပါ။',
    'how.lang.t': 'English & မြန်မာ', 'how.lang.d': 'Peerly ကို English သို့မဟုတ် မြန်မာလို သုံးနိုင်ပါတယ် — menu ကနေ အချိန်မရွေး ပြောင်းပါ။',

    'feed.all': 'အားလုံး', 'feed.mine': 'ကျွန်ုပ်၏ အုပ်စုများ', 'feed.more': 'ထပ်ကြည့်ရန်',
    'feed.empty': 'ပို့စ် မရှိသေးပါ။ ပထမဆုံး နှုတ်ဆက်လိုက်ပါ 👋',
    'feed.emptyMine': 'သင့်အုပ်စုများမှ ပို့စ် မရှိသေးပါ။ အုပ်စုအချို့ ဝင်ပါ ဒါမှမဟုတ် ပထမဆုံး ပို့စ် ရေးပါ!',
    'feed.end': 'အားလုံး ကြည့်ပြီးပါပြီ ✨',
    'comp.ph': '{name}၊ ဘာတွေ မျှဝေချင်လဲ?', 'comp.phGroup': '{group} ထဲ တစ်ခုခု ရေးပါ…',
    'comp.guest': 'ပို့စ်တင်၊ comment ပေးပြီး လူတွေနဲ့ တွေ့ဖို့ Peerly ကို ဝင်ပါ။',
    'comp.photo': 'ဓာတ်ပုံ', 'comp.post': 'တင်မည်', 'comp.posting': 'တင်နေသည်…', 'comp.where': 'တင်မည့်နေရာ',
    'comp.everyone': 'အားလုံး (အုပ်စုမရွေး)',
    'post.like': 'Like', 'post.comment': 'Comment', 'post.delete': 'ဖျက်ရန်',
    'post.confirmDelete': 'ဒီပို့စ်ကို ဖျက်မလား?', 'post.in': '—',
    'post.likes': 'Like {n}', 'post.comments': 'Comment {n}',
    'cmt.ph': 'Comment ရေးပါ…', 'cmt.send': 'ပို့မည်', 'cmt.none': 'Comment မရှိသေးပါ။',
    'side.mygroups': 'ကျွန်ုပ်၏ အုပ်စုများ', 'side.people': 'တွေ့ဆုံသင့်သူများ', 'side.all': 'အားလုံး',
    'side.nogroups': 'အုပ်စု မဝင်ရသေးပါ။', 'side.find': 'အုပ်စု ရှာရန်',
    'side.say': 'နှုတ်ဆက်ရန်',

    'groups.title': 'အုပ်စုများ', 'groups.sub': 'သင့်လူတွေကို ရှာပါ။ Feed ပြည့်လာအောင် အုပ်စုအချို့ ဝင်ပါ။',
    'groups.create': '+ အုပ်စုသစ် ဖွဲ့ရန်', 'groups.members': 'အဖွဲ့ဝင် {n}', 'groups.posts': 'ပို့စ် {n}',
    'groups.join': 'ဝင်မည်', 'groups.joined': 'ဝင်ပြီး ✓', 'groups.leave': 'အုပ်စုမှ ထွက်ရန်',
    'groups.open': 'ဖွင့်ရန်', 'groups.joinedToast': '{group} ထဲ ဝင်ပြီးပါပြီ 🎉', 'groups.leftToast': '{group} မှ ထွက်ပြီးပါပြီ',
    'groups.delete': 'အုပ်စု ဖျက်ရန်', 'groups.confirmDelete': 'ဒီအုပ်စုနဲ့ ပို့စ်အားလုံးကို ဖျက်မလား?',
    'groups.empty': 'ဒီအုပ်စုမှာ ပို့စ် မရှိသေးပါ။ စကားစလိုက်ပါ!',
    'cg.title': 'အုပ်စုသစ် ဖွဲ့ရန်', 'cg.sub': 'နေရာ၊ ကျွမ်းကျင်မှု ဒါမှမဟုတ် စိတ်ဝင်စားမှုတစ်ခုနဲ့ လူတွေကို စုစည်းပါ။',
    'cg.emoji': 'အိုင်ကွန်', 'cg.name': 'အုပ်စုအမည်', 'cg.name.ph': 'ဥပမာ - အူလူရောက် မြန်မာများ',
    'cg.desc': 'ဘာအကြောင်းလဲ?', 'cg.desc.ph': 'ဘယ်သူတွေ ဝင်သင့်ပြီး ဘာတွေ ပြောကြမလဲ',
    'cg.btn': 'အုပ်စု ဖွဲ့မည်', 'cg.short': 'အုပ်စုအမည် အနည်းဆုံး စာလုံး ၃ လုံး လိုပါတယ်',

    'onb.title': 'အုပ်စုအချို့ ဝင်ပါ', 'onb.sub': 'အနည်းဆုံး တစ်ခု ရွေးပါ။ သူတို့ရဲ့ ပို့စ်တွေ သင့် feed မှာ ပေါ်လာပါမယ် — နောက်မှ ပြောင်းလို့ရပါတယ်။',
    'onb.done': 'Feed သို့ သွားမည်', 'onb.pick': 'အုပ်စု အနည်းဆုံး တစ်ခု ရွေးပါ 🙂', 'onb.welcome': 'Peerly မှ ကြိုဆိုပါတယ်၊ {name}! 🎉',

    'br.title': 'အတူ လေ့လာမယ့်သူတွေ ရှာပါ', 'br.sub': 'သင်လေ့လာချင်တာကို သင်ပေးနိုင်သူတွေကို ရှာဖွေပါ',
    'br.search': 'ကျွမ်းကျင်မှု ဒါမှမဟုတ် နာမည်ဖြင့် ရှာပါ…', 'br.all': 'အားလုံး', 'br.sugg': 'အကြံပြု', 'br.online': 'အွန်လိုင်း',
    'br.video': 'Video Call', 'br.inperson': 'လူချင်းတွေ့',

    'pf.create': 'ပရိုဖိုင် ဖန်တီးပါ', 'pf.mine': 'ကျွန်ုပ်၏ ပရိုဖိုင်', 'pf.sub': 'သင့်အကြောင်းနဲ့ မျှဝေနိုင်တာတွေကို နည်းနည်း ပြောပြပါ',
    'pf.photo': 'ဓာတ်ပုံ ထည့်ရန်', 'pf.name': 'နာမည်', 'pf.bio': 'သင့်အကြောင်း', 'pf.bio.ph': 'ဘယ်မှာနေလဲ၊ ဘာလုပ်လဲ၊ ဘာကို နှစ်သက်လဲ …',
    'pf.teach': 'မျှဝေနိုင်သော ကျွမ်းကျင်မှုများ', 'pf.learn': 'လေ့လာချင်သော ကျွမ်းကျင်မှုများ', 'pf.pref': 'ဘယ်လို တွေ့ဆုံရတာ ကြိုက်လဲ?',
    'pf.save': 'သိမ်းပြီး ဆက်သွားမည်', 'pf.saved': 'ပရိုဖိုင် သိမ်းပြီးပါပြီ!', 'pf.saved.msg': 'ကောင်းပါတယ် {name}! သင့်ပရိုဖိုင် အသက်ဝင်ပါပြီ။',

    'auth.in': 'ဝင်ရောက်ရန်', 'auth.up': 'စာရင်းသွင်းရန်', 'auth.pass': 'စကားဝှက်', 'auth.create': 'အကောင့် ဖွင့်မည်',

    'toast.welcomeback': 'ပြန်လာတာ ကြိုဆိုပါတယ်၊ {name}! 👋', 'toast.created': 'အကောင့် ဖွင့်ပြီးပါပြီ! ပရိုဖိုင် ပြင်ဆင်ကြရအောင်။',
    'toast.loggedout': 'ထွက်ပြီးပါပြီ။ နောက်မှ ပြန်တွေ့မယ်!', 'toast.loginFirst': 'Peerly ကို အရင် ဝင်ပါ 🙂',
    'toast.tooBig': 'ဓာတ်ပုံ အရမ်းကြီးနေပါတယ် (အများဆုံး 6MB)',

    'nav.rooms': 'အခန်းများ', 'side.rooms': 'Live အခန်းများ',
    'rooms.title': 'အခန်းများ', 'rooms.sub': 'အတူ ကြည့်၊ အတူ စာကျက်၊ ဒါမှမဟုတ် အေးအေးဆေးဆေး စကားပြော — chat နဲ့ voice ပါ။',
    'rooms.kind.watch': 'အတူ ကြည့်ရန်', 'rooms.kind.study': 'စာကျက်ခန်း', 'rooms.kind.hangout': 'Hangout',
    'rooms.kindd.watch': 'YouTube ဒါမှမဟုတ် ကိုယ်ပိုင် ဗီဒီယို၊ တပြိုင်နက်', 'rooms.kindd.study': 'အတူသုံး focus timer + အနားယူချိန်', 'rooms.kindd.hangout': 'သူငယ်ချင်းတွေနဲ့ voice chat',
    'rooms.live': '{n} ယောက် ရှိနေ', 'rooms.host': 'Host: {name}', 'rooms.noVideo': 'ဗီဒီယို မရှိသေး', 'rooms.videoReady': 'ဗီဒီယို အသင့်',
    'rooms.empty': 'အခန်း မရှိသေးပါ။ တစ်ခု ဖွင့်ပြီး သူငယ်ချင်းတွေကို ဖိတ်ပါ!', 'rooms.start': 'အခန်း ဖွင့်ရန်',
    'rooms.notFound': 'ဒီအခန်း ပိတ်သွားပြီ ဒါမှမဟုတ် မရှိပါ။', 'rooms.joinToEnter': 'အခန်းထဲ ဝင်ဖို့ Peerly ကို အရင် ဝင်ပါ 🙂',
    'rooms.closed': 'Host က အခန်းကို ပိတ်လိုက်ပါပြီ', 'rooms.share': 'Link မျှဝေရန်', 'rooms.close': 'အခန်း ပိတ်ရန်',
    'rooms.confirmClose': 'ဒီအခန်းကို အားလုံးအတွက် ပိတ်မလား?', 'rooms.linkCopied': 'အခန်း link ကူးပြီးပါပြီ — သူငယ်ချင်းတွေဆီ ပို့လိုက်ပါ!',
    'rooms.reconnecting': 'ပြန်ချိတ်နေသည်…', 'rooms.chat': 'Chat', 'rooms.chatPh': 'တစ်ခုခု ပြောပါ…', 'rooms.sayHi': 'နှုတ်ဆက်လိုက်ပါ 👋',
    'rooms.namePh.watch': 'ဥပမာ - သောကြာ ရုပ်ရှင်ည', 'rooms.namePh.study': 'ဥပမာ - စာမေးပွဲ စာကျက်', 'rooms.namePh.hangout': 'ဥပမာ - ညဘက် အေးအေးဆေးဆေး',
    'cr.title': 'အခန်း ဖွင့်ရန်', 'cr.name': 'အခန်းအမည်', 'cr.url': 'YouTube link (မထည့်လည်းရ)', 'cr.desc': 'မှတ်ချက် (မထည့်လည်းရ)',
    'cr.descPh': 'ဥပမာ - စာမေးပွဲရက် — ကင်မရာ မဖွင့်လည်းရ', 'cr.group': 'ပြမည့်နေရာ', 'cr.btn': 'အခန်း ဖွင့်မည်',
    'watch.tapSync': 'ဗီဒီယိုထဲ ဝင်ရန် နှိပ်ပါ', 'watch.pastePh': 'YouTube link ထည့်ပါ…', 'watch.play': 'အားလုံးအတွက် ဖွင့်မည်',
    'watch.upload': 'တင်ရန်', 'watch.uploadHint': 'မျှဝေခွင့်ရှိသော MP4/WebM ဗီဒီယို တင်ပါ (အများဆုံး 400 MB)',
    'watch.empty': 'အတူကြည့်ဖို့ အောက်မှာ YouTube link ထည့်ပါ', 'watch.nothing': 'ဘာမှ ဖွင့်မထားသေးပါ',
    'watch.uploaded': 'တင်ထားသော ဗီဒီယို', 'watch.tooBig': 'ဗီဒီယို အရမ်းကြီးနေပါတယ် (အများဆုံး 400 MB)', 'watch.ytError': 'ဒီဗီဒီယိုကို ဒီမှာ ဖွင့်လို့ မရပါ။',
    'watch.by.play': '{name} က {time} မှာ ဖွင့်လိုက်သည်', 'watch.by.pause': '{name} က {time} မှာ ရပ်လိုက်သည်', 'watch.by.seek': '{name} က {time} သို့ ကျော်လိုက်သည်', 'watch.by.video': '{name} က ဗီဒီယို ပြောင်းလိုက်သည်',
    'study.focus': 'အာရုံစိုက်ချိန်', 'study.break': 'အနားယူချိန်', 'study.start': 'စတင်', 'study.pause': 'ခဏရပ်', 'study.skip': 'ကျော်',
    'study.focusHint': 'ဖုန်းချထား၊ mic ပိတ်ထား။ ကြိုးစားကြရအောင်။', 'study.breakHint': 'ကိုယ်လက်ဆန့်၊ စကားပြော၊ ရေသောက် ☕',
    'study.breakNow': '☕ အနားယူချိန် ရောက်ပြီ!', 'study.focusNow': '📚 အာရုံစိုက်ချိန် ပြန်ရောက်ပြီ။',
    'study.by.start': '{name} က timer စလိုက်သည်', 'study.by.pause': '{name} က timer ရပ်လိုက်သည်', 'study.by.reset': '{name} က timer ပြန်စလိုက်သည်',
    'study.by.skip': '{name} က နောက်တစ်ပိုင်းသို့ ကျော်လိုက်သည်', 'study.by.set': '{name} က timer ပြောင်းလိုက်သည်',
    'hang.sub': 'Voice chat ထဲ ဝင်ပြီး အတူ စကားပြောပါ။',
    'call.joinVoice': 'Voice ဝင်ရန်', 'call.joinVideo': 'ကင်မရာနှင့်', 'call.joinHang': 'Call ထဲ ဝင်ရန်', 'call.leave': 'ထွက်ရန်',
    'call.mic': 'မိုက်', 'call.cam': 'ကင်မရာ', 'call.screen': 'Screen မျှဝေ', 'call.you': 'သင်',
    'call.notSetUp': 'ဒီ server မှာ call မပြင်ဆင်ရသေးပါ', 'call.noMic': 'မိုက်ကို သုံးလို့ မရပါ', 'call.noCam': 'ကင်မရာကို သုံးလို့ မရပါ',
    'call.noScreen': 'ဒီစက်မှာ screen မျှဝေလို့ မရပါ', 'call.failed': 'Call ထဲ ဝင်လို့ မရပါ', 'call.tapAudio': 'အသံကြားရန် နှိပ်ပါ',
    'call.with': '{name} နှင့် call', 'call.started': 'Voice call စတင်ခဲ့သည်', 'call.videoStarted': 'Video call စတင်ခဲ့သည်', 'call.join': 'ဝင်မည်',
    'call.ended': 'Call ပြီးဆုံးပါပြီ', 'rooms.lounge': 'Lounge', 'rooms.peerly': 'Peerly', 'call.incoming': 'က သင့်ကို ခေါ်နေသည်…', 'call.incomingVideo': 'က video call ခေါ်နေသည်…',
    'time.now': 'ယခုလေးတင်', 'time.m': '{n} မိနစ်', 'time.h': '{n} နာရီ', 'time.d': '{n} ရက်',
  },
};

let LANG = 'en';
try { LANG = localStorage.getItem('peerly-lang') || ((navigator.language || '').startsWith('my') ? 'my' : 'en'); } catch {}
if (!I18N[LANG]) LANG = 'en';

function t(key, vars) {
  let s = (I18N[LANG] && I18N[LANG][key]) || I18N.en[key] || key;
  if (vars) Object.keys(vars).forEach(k => { s = s.split('{' + k + '}').join(vars[k]); });
  return s;
}

// applyLang updates every tagged element. If an element also holds child elements
// (like a nav link with an unread badge), only its first text node is replaced.
function applyLang() {
  document.documentElement.lang = LANG;
  document.body.classList.toggle('lang-my', LANG === 'my');
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const txt = t(el.getAttribute('data-i18n'));
    if (el.children.length === 0) { el.textContent = txt; return; }
    const node = [...el.childNodes].find(n => n.nodeType === 3 && n.textContent.trim());
    if (node) node.textContent = txt; else el.insertBefore(document.createTextNode(txt), el.firstChild);
  });
  document.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.getAttribute('data-i18n-ph')); });
}

function toggleLang() {
  LANG = LANG === 'en' ? 'my' : 'en';
  try { localStorage.setItem('peerly-lang', LANG); } catch {}
  applyLang();
  if (window.onLangChanged) onLangChanged();
}

document.addEventListener('DOMContentLoaded', applyLang);
