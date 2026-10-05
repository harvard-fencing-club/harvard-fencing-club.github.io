/*
 * EDIT YOUR CLUB DETAILS HERE. Every page reads from this file.
 * No build step. Keep this file as ordinary JavaScript and preserve the commas.
 */
window.CLUB_CONTENT = {
  email: "harvardfencingclub@gmail.com",
  instagram: "theharvardfencingclub", // Handle without @.
  whatsapp: "https://chat.whatsapp.com/L9N5Ad1ajsz0t6oA2TtgGX", // Group invite link.
  socoUrl: "https://soco.college.harvard.edu/257861/home/",

  // Home-page welcome line.
  join: "Open to everyone!",

  // weekday: 0 = Sunday … 6 = Saturday. start/end are 24-hour Cambridge time
  // and power the live "next practice" badge on the home page.
  // Optional tag shows under the day; optional label replaces "practice" in the badge.
  practice: {
    location: "Location: MAC · Fencing Room 1 · 3rd floor",
    mapUrl: "https://www.google.com/maps/search/?api=1&query=Malkin+Athletic+Center%2C+39+Holyoke+St%2C+Cambridge%2C+MA",
    sessions: [
      { day: "Tuesday", time: "7:30–9:30 PM", weekday: 2, start: "19:30", end: "21:30" },
      { day: "Thursday", time: "7–10 PM", weekday: 4, start: "19:00", end: "22:00", tag: "Crimson Club Open Bouting", label: "Open bouting" },
      { day: "Sunday", time: "10:30 AM–12:30 PM", weekday: 0, start: "10:30", end: "12:30" }
    ]
  },

  // The home slideshow plays every photo in the club Drive folder (listed in photos.js).
  // After adding photos to the folder, run:  python update-photos.py
  slideshow: {
    autoplay: true,
    intervalMs: 5500,
    shuffle: true // Random order on each visit.
  },

  // Optional date (YYYY-MM-DD) shows the day on the left and marks the event "Past" afterwards.
  // For weekly events, use repeats: "Thu" instead of a date.
  // Optional link: href + linkLabel. Leave both out for no link.
  events: [
    {
      tag: "Competition",
      title: "The Big One",
      subtitle: "NEIFC Fall Invitational",
      date: "2026-11-01",
      place: "Smith College",
      description: "The New England Intercollegiate Fencing Conference’s fall invitational. Reach out to ask us about registration and travel!",
      href: "https://www.neifc.org/big-one",
      linkLabel: "Tournament details"
    },
    {
      tag: "Open bouting",
      title: "Crimson Club Open Bouting",
      subtitle: "",
      date: "",
      repeats: "Thu",
      place: "Thursdays · 7–10 PM",
      description: "Get to fence against collegiate clubs from across Massachusetts. Please message to inform us before coming!"
    }
  ],

  // Names and roles confirmed by the club. For a profile picture, put the image in
  // assets/team/ and set photo, e.g. photo: "assets/team/adi-raj.jpg".
  // photoPosition moves the crop ("50% 30%" shows more of the top).
  leaders: [
    { name: "Adi Raj", role: "President", photo: "assets/team/adi-raj.png", photoPosition: "55% 45%" },
    { name: "Tatum Mueller", role: "President", photo: "assets/team/tatum-mueller.png", photoPosition: "50% 45%" },
    { name: "Dafne Unsal Nuchi", role: "Executive", photo: "assets/team/dafne-unsal-nuchi.png", photoPosition: "50% 40%" },
    { name: "Ziva Benedejcic", role: "Executive", photo: "assets/team/ziva-benedejcic.png", photoPosition: "45% 45%" }
  ],

  // Photos beside the Events list and under Leadership on the Team page.
  // Use an image in assets/photos/ (src: "assets/photos/big-one.jpg") or a
  // Google Drive file ID (driveId: "..."). alt briefly describes the photo.
  eventPhotos: [
    { src: "assets/photos/group-5.jpeg", alt: "Club fencers in jackets touching blade tips together in a Harvard gym", position: "50% 60%" },
    { src: "assets/photos/group-2.jpeg", alt: "Club fencers in full gear lined up in front of the fencing room mirrors", position: "50% 45%" }
  ],
  teamPhotos: [
    { src: "assets/photos/group-1.jpeg", alt: "Smiling group selfie of club members on the fencing strips", position: "50% 40%" },
    { src: "assets/photos/group-3.jpeg", alt: "Club members lined up in front of the fencing room mirrors", position: "50% 50%" },
    { src: "assets/photos/group-4.jpeg", alt: "Group selfie of club members after practice in the fencing room", position: "50% 45%" }
  ],

  // Add real outreach initiatives here as { title, description, href } when you have them.
  outreach: {
    heading: "Contact us!",
    body: "We're happy to hear any feedback, comments, criticisms, and suggestions from student groups, clubs, and fencers across Boston!",
    items: []
  },

  resources: [
    {
      group: "Watch",
      items: [
        { label: "CyrusofChaos", description: "The best fencing channel on YouTube!", href: "https://www.youtube.com/@CyrusofChaos" },
        { label: "Olympic fencing", description: "The most prestigious fencing event", href: "https://www.youtube.com/watch?v=x_7WnX0xPZg" },
        { label: "FIE Fencing Channel", description: "World Cups, Worlds, and Olympics", href: "https://www.youtube.com/channel/UCJEy8aBnqDymMIcJCh72gMw" },
        { label: "USA Fencing YouTube", description: "Team USA highlights and national events", href: "https://www.youtube.com/@USAFencing" }
      ]
    },
    {
      group: "Compete",
      items: [
        { label: "USA Fencing", description: "National governing body and membership", href: "https://www.usafencing.org" },
        { label: "NEIFC", description: "New England intercollegiate fencing", href: "https://www.neifc.org" },
        { label: "FencingTimeLive", description: "Live pools, brackets, and results", href: "https://www.fencingtimelive.com" },
        { label: "Fencing Tracker", description: "Ratings, results, and fencer history", href: "https://fencingtracker.com" }
      ]
    },
    {
      group: "Learn",
      items: [
        { label: "FIE", description: "International federation and official rules", href: "https://fie.org" },
        { label: "Harvard fencing history", description: "Harvard Athletics timeline, from 1888", href: "https://gocrimson.com/sports/2020/5/5/information-history-traditiontimeline.aspx" },
        // { label: "Harvard SoCo", description: "Our official student org page", href: "https://soco.college.harvard.edu/257861/home/" }
      ]
    }
  ],

  // Replace the cautious equipment/competition answers with confirmed policies.
  faqs: [
    { question: "I’ve never fenced. Can I come?", answer: "Of course! Show up to Tuesday or Sunday practice, and we'll give you all the equipment and training you need!" },
    { question: "Do I need my own equipment?", answer: "Nope! We will provide everything, just make sure to let us know if you have any special requests or accommodations we can help with." },
    { question: "Who can join?", answer: "Students from every Harvard school, MIT, and other colleges in the area are all welcome. If you don't have a Harvard athletics membership,  we'll sign you in at the front desk." },
    { question: "What are the three weapons?", answer: "Sabre is the fast, with cuts and thrusts anywhere above the waist. Foil is lighter and uses only the point, targeting the torso. Épée is the heaviest and is also a point weapon, with the whole body as the target.  We have fencers in all three!" },
    { question: "Where exactly are these practices?", answer: "The Malkin Athletic Center's Fencing Room 1 (FR1) on the 3rd floor -- text the Whatsapp if you need help getting there." },
    { question: "How do I get into competitions?", answer: "Talk to us if you want to compete! We can work together to figure out eligibility, registration, and travel." },
    { question: "What can I do to get excited about fencing?", answer: "Start by watching this awesome highlight reel!", link: { href: "https://www.youtube.com/watch?v=GaCW_NtCUMg", label: "Oh Sanguk: Hero" } }
  ]
};
