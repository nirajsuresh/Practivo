import { db } from "./db";
import { sql } from "drizzle-orm";
import { users, userProfiles, posts, challenges, follows, pieces, composers, movements, pieceRatings, pieceComments, repertoireEntries } from "@shared/schema";
import pianoLibrary from "./piano-library.json";

interface LibraryComposer {
  name: string;
  pieces: { title: string; movements: string[] }[];
}

export async function autoSeedIfEmpty() {
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
  const existingComposers = await db.select().from(composers).limit(1);

  if (existingComposers.length > 0) {
    const existingRatings = await db.select().from(pieceRatings).limit(1);
    if (existingRatings.length === 0) {
      console.log("Database has catalog but missing community data, seeding new tables...");
      await seedCommunityData();
    } else {
      console.log("Database already has data, skipping auto-seed");
    }
    return;
  }

  console.log("Auto-seeding database with piano library...");

  const libraryData = pianoLibrary as { composers: LibraryComposer[] };

  const composerData = libraryData.composers.map(c => ({ name: c.name }));
  const insertedComposers = await db.insert(composers).values(composerData).returning();
  console.log(`Auto-seeded ${insertedComposers.length} composers`);

  const composerMap = new Map(insertedComposers.map(c => [c.name, c.id]));

  const BATCH_SIZE = 200;
  const allPieceData: { title: string; composerId: number }[] = [];
  for (const comp of libraryData.composers) {
    const cId = composerMap.get(comp.name)!;
    for (const p of comp.pieces) {
      allPieceData.push({ title: p.title, composerId: cId });
    }
  }

  let allInsertedPieces: { id: number; title: string; composerId: number }[] = [];
  for (let i = 0; i < allPieceData.length; i += BATCH_SIZE) {
    const batch = allPieceData.slice(i, i + BATCH_SIZE);
    const inserted = await db.insert(pieces).values(batch).returning();
    allInsertedPieces = allInsertedPieces.concat(inserted);
  }
  console.log(`Auto-seeded ${allInsertedPieces.length} pieces`);

  const pieceMap = new Map<string, number>();
  for (const p of allInsertedPieces) {
    pieceMap.set(`${p.composerId}:${p.title}`, p.id);
  }

  const allMovementData: { name: string; pieceId: number }[] = [];
  for (const comp of libraryData.composers) {
    const cId = composerMap.get(comp.name)!;
    for (const p of comp.pieces) {
      const pId = pieceMap.get(`${cId}:${p.title}`);
      if (pId && p.movements.length > 0) {
        for (const m of p.movements) {
          allMovementData.push({ name: m, pieceId: pId });
        }
      }
    }
  }

  for (let i = 0; i < allMovementData.length; i += BATCH_SIZE) {
    const batch = allMovementData.slice(i, i + BATCH_SIZE);
    await db.insert(movements).values(batch);
  }
  console.log(`Auto-seeded ${allMovementData.length} movements`);

  await seedCommunityData();

  console.log("Auto-seeding complete!");
}

async function seedCommunityData() {
  try {
    const userData = [
      { username: "niraj_suresh", password: "hashedpassword1" },
      { username: "maria_chen", password: "hashedpassword2" },
      { username: "alex_petrov", password: "hashedpassword3" },
      { username: "elena_volkov", password: "hashedpassword4" },
      { username: "david_kim", password: "hashedpassword5" },
      { username: "sophia_martin", password: "hashedpassword6" },
    ];

    const existingUsers = await db.select().from(users).limit(1);
    let userMap: Map<string, string>;

    if (existingUsers.length === 0) {
      const insertedUsers = await db.insert(users).values(userData).returning();
      console.log(`Seeded ${insertedUsers.length} users`);
      userMap = new Map(insertedUsers.map(u => [u.username, u.id]));

      const profileData = [
        { userId: userMap.get("niraj_suresh")!, displayName: "Niraj Suresh", instrument: "Piano", level: "Serious Amateur", location: "Boston, USA", bio: "Classical pianist specializing in the Romantic and Impressionist eras.", avatarUrl: "/images/niraj.png" },
        { userId: userMap.get("maria_chen")!, displayName: "Maria Chen", instrument: "Piano", level: "Professional", location: "San Francisco, USA", bio: "Concert pianist and pedagogue. Juilliard graduate.", avatarUrl: null },
        { userId: userMap.get("alex_petrov")!, displayName: "Alexander Petrov", instrument: "Piano", level: "Advanced Student", location: "Moscow, Russia", bio: "Currently studying at the Moscow Conservatory.", avatarUrl: null },
        { userId: userMap.get("elena_volkov")!, displayName: "Elena Volkov", instrument: "Piano", level: "Professional", location: "Vienna, Austria", bio: "Chamber musician and soloist.", avatarUrl: null },
        { userId: userMap.get("david_kim")!, displayName: "David Kim", instrument: "Piano", level: "Hobbyist", location: "Seoul, South Korea", bio: "Software engineer by day, pianist by night.", avatarUrl: null },
        { userId: userMap.get("sophia_martin")!, displayName: "Sophia Martin", instrument: "Piano", level: "Serious Amateur", location: "Paris, France", bio: "Medical doctor with a passion for French Impressionism.", avatarUrl: null },
      ];

      await db.insert(userProfiles).values(profileData);
      console.log(`Seeded ${profileData.length} user profiles`);

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
      console.log(`Seeded ${followData.length} follow relationships`);
    } else {
      const allUsers = await db.select().from(users);
      userMap = new Map(allUsers.map(u => [u.username, u.id]));
    }

    if (!userMap.get("maria_chen")) {
      console.log("Missing required users for community seed, skipping");
      return;
    }

    const allPieces = await db.select().from(pieces);
    const allComposers = await db.select().from(composers);
    const composerMap = new Map(allComposers.map(c => [c.name, c.id]));

    const findPiece = (composerName: string, titleFragment: string) => {
      const cId = composerMap.get(composerName);
      if (!cId) return undefined;
      return allPieces.find(p => p.composerId === cId && p.title.includes(titleFragment));
    };

    const ballade4 = findPiece("Frédéric Chopin", "Ballade no. 4");
    const ballade1 = findPiece("Frédéric Chopin", "Ballade no. 1");
    const gaspard = findPiece("Maurice Ravel", "Gaspard de la nuit");
    const lisztSonata = findPiece("Franz Liszt", "Sonata in B minor");
    const chopinEtudes10 = findPiece("Frédéric Chopin", "Twelve Études Op. 10");
    const debussyImages = findPiece("Claude Debussy", "Images, Série 1");
    const prokSonata7 = findPiece("Sergei Prokofiev", "Sonata no. 7");
    const debussySuite = findPiece("Claude Debussy", "Suite bergamasque");
    const transcendental = findPiece("Franz Liszt", "Transcendental Études");
    const rachEtudes39 = findPiece("Sergei Rachmaninoff", "Études-tableaux Op. 39");

    if (!ballade4) {
      console.log("Could not find Chopin Ballade No. 4 in catalog, skipping community data");
      return;
    }

    const postData = [
      { userId: userMap.get("maria_chen")!, type: "status_change", content: "Just marked Rachmaninoff Études-tableaux Op. 39 as Performance-ready! Months of work paid off.", pieceId: rachEtudes39?.id },
      { userId: userMap.get("alex_petrov")!, type: "recording", content: "Here's my take on the Chopin Ballade No. 1 coda. Feedback welcome!", pieceId: ballade1?.id, recordingUrl: "https://example.com/recording1" },
      { userId: userMap.get("elena_volkov")!, type: "milestone", content: "Just logged my 500th practice hour this year!", practiceHours: 500 },
      { userId: userMap.get("maria_chen")!, type: "text", content: "Looking for an accompanist for a benefit recital in April. DM if interested!" },
      { userId: userMap.get("david_kim")!, type: "status_change", content: "Started learning Liszt's Sonata in B minor. Wish me luck!", pieceId: lisztSonata?.id },
      { userId: userMap.get("sophia_martin")!, type: "recording", content: "Finally happy with my Debussy Clair de lune. It only took 6 months!", pieceId: debussySuite?.id, recordingUrl: "https://example.com/recording2" },
      { userId: userMap.get("alex_petrov")!, type: "practice_log", content: "4-hour session on the Transcendental Etudes today. Feux follets is finally coming together.", pieceId: transcendental?.id, practiceHours: 4 },
      { userId: userMap.get("elena_volkov")!, type: "text", content: "Does anyone have fingering suggestions for the octave passages in Ravel's Scarbo?" },
      { userId: userMap.get("maria_chen")!, type: "status_change", content: "Adding Prokofiev Piano Sonata No. 7 to my repertoire. The 'War Sonata' energy is unmatched.", pieceId: prokSonata7?.id },
      { userId: userMap.get("david_kim")!, type: "milestone", content: "One year streak of daily practice!", practiceHours: 365 },
    ];

    const existingPosts = await db.select().from(posts).limit(1);
    if (existingPosts.length === 0) {
      await db.insert(posts).values(postData);
      console.log(`Seeded ${postData.length} posts`);
    }

    const challengeData = [
      { title: "Chopin Etude Challenge", description: "Learn and post bars 36-74 of Chopin Etude Op. 10 No. 2. Focus on evenness and clarity.", pieceId: chopinEtudes10?.id, startMeasure: 36, endMeasure: 74, deadline: "2026-03-01", isActive: true },
      { title: "Sight-Reading Sprint", description: "Post a video of yourself sight-reading any Scarlatti sonata. No preparation allowed!", deadline: "2026-02-28", isActive: true },
      { title: "Debussy Impressions", description: "Record and share any movement from Debussy's Images. Let's explore the colors together.", pieceId: debussyImages?.id, deadline: "2026-03-15", isActive: true },
      { title: "Slow Practice Showcase", description: "Post a video practicing any difficult passage at half tempo. Show your process!", deadline: "2026-02-20", isActive: true },
    ];

    const existingChallenges = await db.select().from(challenges).limit(1);
    if (existingChallenges.length === 0) {
      await db.insert(challenges).values(challengeData);
      console.log(`Seeded ${challengeData.length} challenges`);
    }

    const chopinId = composerMap.get("Frédéric Chopin")!;
    const ravelId = composerMap.get("Maurice Ravel")!;

    const existingRepertoire = await db.select().from(repertoireEntries).limit(1);
    if (existingRepertoire.length === 0) {
      const repertoireData = [
        { userId: userMap.get("maria_chen")!, composerId: chopinId, pieceId: ballade4.id, status: "Performance-ready", startedDate: "2023-06-15" },
        { userId: userMap.get("alex_petrov")!, composerId: chopinId, pieceId: ballade4.id, status: "In Progress", startedDate: "2025-09-01" },
        { userId: userMap.get("elena_volkov")!, composerId: chopinId, pieceId: ballade4.id, status: "Learned", startedDate: "2022-01-10" },
        { userId: userMap.get("david_kim")!, composerId: chopinId, pieceId: ballade4.id, status: "Wishlist" },
        { userId: userMap.get("sophia_martin")!, composerId: chopinId, pieceId: ballade4.id, status: "In Progress", startedDate: "2025-11-01" },
        { userId: userMap.get("niraj_suresh")!, composerId: chopinId, pieceId: ballade4.id, status: "In Progress", startedDate: "2025-01-20" },
      ];
      if (gaspard) {
        repertoireData.push(
          { userId: userMap.get("maria_chen")!, composerId: ravelId, pieceId: gaspard.id, status: "In Progress", startedDate: "2025-10-01" },
          { userId: userMap.get("alex_petrov")!, composerId: ravelId, pieceId: gaspard.id, status: "Stopped learning", startedDate: "" },
          { userId: userMap.get("elena_volkov")!, composerId: ravelId, pieceId: gaspard.id, status: "Performance-ready", startedDate: "2020-05-01" },
        );
      }
      await db.insert(repertoireEntries).values(repertoireData);
      console.log(`Seeded ${repertoireData.length} repertoire entries`);
    }

    const ratingData = [
      { pieceId: ballade4.id, userId: userMap.get("maria_chen")!, rating: 5 },
      { pieceId: ballade4.id, userId: userMap.get("alex_petrov")!, rating: 5 },
      { pieceId: ballade4.id, userId: userMap.get("elena_volkov")!, rating: 4 },
      { pieceId: ballade4.id, userId: userMap.get("david_kim")!, rating: 5 },
      { pieceId: ballade4.id, userId: userMap.get("sophia_martin")!, rating: 4 },
      { pieceId: ballade4.id, userId: userMap.get("niraj_suresh")!, rating: 5 },
    ];
    if (gaspard) {
      ratingData.push(
        { pieceId: gaspard.id, userId: userMap.get("elena_volkov")!, rating: 5 },
        { pieceId: gaspard.id, userId: userMap.get("maria_chen")!, rating: 4 },
      );
    }

    await db.insert(pieceRatings).values(ratingData);
    console.log(`Seeded ${ratingData.length} piece ratings`);

    const commentData = [
      { pieceId: ballade4.id, userId: userMap.get("maria_chen")!, content: "The counterpoint in the development section is endlessly fascinating. Every time I revisit it, I hear new voices." },
      { pieceId: ballade4.id, userId: userMap.get("alex_petrov")!, content: "Currently working on the coda. The octave passages are brutal but so rewarding when they click." },
      { pieceId: ballade4.id, userId: userMap.get("elena_volkov")!, content: "I performed this at my graduation recital. The emotional arc from the opening theme to the devastating coda is unmatched in the repertoire." },
      { pieceId: ballade4.id, userId: userMap.get("david_kim")!, content: "Listening to Zimerman's recording on repeat. Someday I'll attempt this one." },
      { pieceId: ballade4.id, userId: userMap.get("sophia_martin")!, content: "The way Chopin weaves the main theme through increasingly complex variations is pure genius. Op. 52 is his greatest achievement." },
    ];
    if (gaspard) {
      commentData.push(
        { pieceId: gaspard.id, userId: userMap.get("elena_volkov")!, content: "Scarbo is technically the hardest, but Le Gibet is the movement that truly tests your artistry. That repeated B-flat bell tone..." },
      );
    }

    await db.insert(pieceComments).values(commentData);
    console.log(`Seeded ${commentData.length} piece comments`);

    console.log("Community data seeding complete!");
  } catch (error) {
    console.error("Error seeding community data:", error);
  }
}
