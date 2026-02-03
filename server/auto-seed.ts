import { db } from "./db";
import { users, userProfiles, posts, challenges, follows, pieces, composers } from "@shared/schema";
import { eq } from "drizzle-orm";

export async function autoSeedIfEmpty() {
  const existingUsers = await db.select().from(users).limit(1);
  
  if (existingUsers.length > 0) {
    console.log("Database already has data, skipping auto-seed");
    return;
  }

  console.log("Auto-seeding database with sample data...");

  const existingPieces = await db.select().from(pieces);
  if (existingPieces.length === 0) {
    console.log("No pieces found, please run the main seed script first");
    return;
  }

  const pieceMap = new Map(existingPieces.map(p => [p.title, p.id]));

  const userData = [
    { username: "niraj_suresh", password: "hashedpassword1" },
    { username: "maria_chen", password: "hashedpassword2" },
    { username: "alex_petrov", password: "hashedpassword3" },
    { username: "elena_volkov", password: "hashedpassword4" },
    { username: "david_kim", password: "hashedpassword5" },
    { username: "sophia_martin", password: "hashedpassword6" },
  ];

  const insertedUsers = await db.insert(users).values(userData).returning();
  console.log(`Auto-seeded ${insertedUsers.length} users`);

  const userMap = new Map(insertedUsers.map(u => [u.username, u.id]));

  const profileData = [
    { userId: userMap.get("niraj_suresh")!, displayName: "Niraj Suresh", instrument: "Piano", level: "Serious Amateur", location: "Boston, USA", bio: "Classical pianist specializing in the Romantic and Impressionist eras. Alumnus of the Conservatorio di Milano.", avatarUrl: "/images/niraj.png" },
    { userId: userMap.get("maria_chen")!, displayName: "Maria Chen", instrument: "Piano", level: "Professional", location: "San Francisco, USA", bio: "Concert pianist and pedagogue. Juilliard graduate. Specializing in Russian Romantic repertoire.", avatarUrl: null },
    { userId: userMap.get("alex_petrov")!, displayName: "Alexander Petrov", instrument: "Piano", level: "Advanced Student", location: "Moscow, Russia", bio: "Currently studying at the Moscow Conservatory. Competition enthusiast.", avatarUrl: null },
    { userId: userMap.get("elena_volkov")!, displayName: "Elena Volkov", instrument: "Piano", level: "Professional", location: "Vienna, Austria", bio: "Chamber musician and soloist. Passionate about contemporary classical music.", avatarUrl: null },
    { userId: userMap.get("david_kim")!, displayName: "David Kim", instrument: "Piano", level: "Hobbyist", location: "Seoul, South Korea", bio: "Software engineer by day, pianist by night. Working through the complete Chopin Nocturnes.", avatarUrl: null },
    { userId: userMap.get("sophia_martin")!, displayName: "Sophia Martin", instrument: "Piano", level: "Serious Amateur", location: "Paris, France", bio: "Medical doctor with a lifelong passion for piano. Currently focused on French Impressionism.", avatarUrl: null },
  ];

  await db.insert(userProfiles).values(profileData);
  console.log(`Auto-seeded ${profileData.length} user profiles`);

  const followData = [
    { followerId: userMap.get("niraj_suresh")!, followingId: userMap.get("maria_chen")! },
    { followerId: userMap.get("niraj_suresh")!, followingId: userMap.get("alex_petrov")! },
    { followerId: userMap.get("niraj_suresh")!, followingId: userMap.get("elena_volkov")! },
    { followerId: userMap.get("maria_chen")!, followingId: userMap.get("niraj_suresh")! },
    { followerId: userMap.get("alex_petrov")!, followingId: userMap.get("niraj_suresh")! },
    { followerId: userMap.get("elena_volkov")!, followingId: userMap.get("niraj_suresh")! },
    { followerId: userMap.get("david_kim")!, followingId: userMap.get("maria_chen")! },
    { followerId: userMap.get("sophia_martin")!, followingId: userMap.get("elena_volkov")! },
  ];

  await db.insert(follows).values(followData);
  console.log(`Auto-seeded ${followData.length} follow relationships`);

  const postData = [
    { userId: userMap.get("maria_chen")!, type: "status_change", content: "Just marked Rachmaninoff Piano Concerto No. 3 as Performance-ready! Three years of work paid off.", pieceId: pieceMap.get("Piano Concerto No. 3 in D minor") },
    { userId: userMap.get("alex_petrov")!, type: "recording", content: "Here's my take on the Chopin Ballade No. 1 coda. Feedback welcome!", pieceId: pieceMap.get("Ballade No. 1 in G minor"), recordingUrl: "https://example.com/recording1" },
    { userId: userMap.get("elena_volkov")!, type: "milestone", content: "Just logged my 500th practice hour this year!", practiceHours: 500 },
    { userId: userMap.get("maria_chen")!, type: "text", content: "Looking for an accompanist for a benefit recital in April. DM if interested!" },
    { userId: userMap.get("david_kim")!, type: "status_change", content: "Started learning Liszt's Sonata in B minor. Wish me luck!", pieceId: pieceMap.get("Sonata in B minor") },
    { userId: userMap.get("sophia_martin")!, type: "recording", content: "Finally happy with my Debussy Clair de lune. It only took 6 months!", pieceId: pieceMap.get("Suite bergamasque"), recordingUrl: "https://example.com/recording2" },
    { userId: userMap.get("alex_petrov")!, type: "practice_log", content: "4-hour session on the Transcendental Etudes today. Feux follets is finally coming together.", pieceId: pieceMap.get("Transcendental Études"), practiceHours: 4 },
    { userId: userMap.get("elena_volkov")!, type: "text", content: "Does anyone have fingering suggestions for the octave passages in Ravel's Scarbo?" },
    { userId: userMap.get("maria_chen")!, type: "status_change", content: "Adding Prokofiev Piano Sonata No. 7 to my repertoire. The 'War Sonata' energy is unmatched.", pieceId: pieceMap.get("Piano Sonata No. 7 in B-flat major") },
    { userId: userMap.get("david_kim")!, type: "milestone", content: "One year streak of daily practice!", practiceHours: 365 },
  ];

  await db.insert(posts).values(postData);
  console.log(`Auto-seeded ${postData.length} posts`);

  const challengeData = [
    { title: "Chopin Etude Challenge", description: "Learn and post bars 36-74 of Chopin Etude Op. 10 No. 2 (chromatic thirds). Focus on evenness and clarity.", pieceId: pieceMap.get("Études, Op. 10"), startMeasure: 36, endMeasure: 74, deadline: "2026-03-01", isActive: true },
    { title: "Sight-Reading Sprint", description: "Post a video of yourself sight-reading any Scarlatti sonata. No preparation allowed!", deadline: "2026-02-28", isActive: true },
    { title: "Debussy Impressions", description: "Record and share any movement from Debussy's Images. Let's explore the colors together.", pieceId: pieceMap.get("Images, Book I"), deadline: "2026-03-15", isActive: true },
    { title: "Slow Practice Showcase", description: "Post a video practicing any difficult passage at half tempo. Show your process!", deadline: "2026-02-20", isActive: true },
  ];

  await db.insert(challenges).values(challengeData);
  console.log(`Auto-seeded ${challengeData.length} challenges`);

  console.log("Auto-seeding complete!");
}
