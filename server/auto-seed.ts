import { db } from "./db";
import { users, userProfiles, posts, challenges, follows, pieces, composers, movements } from "@shared/schema";

export async function autoSeedIfEmpty() {
  const existingComposers = await db.select().from(composers).limit(1);
  
  if (existingComposers.length > 0) {
    console.log("Database already has data, skipping auto-seed");
    return;
  }

  console.log("Auto-seeding database with full catalog...");

  const composerData = [
    { name: "Johann Sebastian Bach" },
    { name: "Ludwig van Beethoven" },
    { name: "Frédéric Chopin" },
    { name: "Claude Debussy" },
    { name: "Franz Liszt" },
    { name: "Wolfgang Amadeus Mozart" },
    { name: "Sergei Rachmaninoff" },
    { name: "Maurice Ravel" },
    { name: "Alexander Scriabin" },
    { name: "Robert Schumann" },
    { name: "Franz Schubert" },
    { name: "Johannes Brahms" },
    { name: "Pyotr Ilyich Tchaikovsky" },
    { name: "Sergei Prokofiev" },
    { name: "Domenico Scarlatti" },
    { name: "Joseph Haydn" },
    { name: "Felix Mendelssohn" },
    { name: "Béla Bartók" },
    { name: "Olivier Messiaen" },
    { name: "György Ligeti" },
  ];

  const insertedComposers = await db.insert(composers).values(composerData).returning();
  console.log(`Auto-seeded ${insertedComposers.length} composers`);

  const composerMap = new Map(insertedComposers.map(c => [c.name, c.id]));

  const pieceData = [
    { title: "Well-Tempered Clavier, Book I", composerId: composerMap.get("Johann Sebastian Bach")! },
    { title: "Goldberg Variations", composerId: composerMap.get("Johann Sebastian Bach")! },
    { title: "Italian Concerto", composerId: composerMap.get("Johann Sebastian Bach")! },
    { title: "French Suite No. 5 in G major", composerId: composerMap.get("Johann Sebastian Bach")! },
    
    { title: "Piano Sonata No. 8 'Pathétique'", composerId: composerMap.get("Ludwig van Beethoven")! },
    { title: "Piano Sonata No. 14 'Moonlight'", composerId: composerMap.get("Ludwig van Beethoven")! },
    { title: "Piano Sonata No. 23 'Appassionata'", composerId: composerMap.get("Ludwig van Beethoven")! },
    { title: "Piano Concerto No. 5 'Emperor'", composerId: composerMap.get("Ludwig van Beethoven")! },
    
    { title: "Ballade No. 1 in G minor", composerId: composerMap.get("Frédéric Chopin")! },
    { title: "Ballade No. 4 in F minor", composerId: composerMap.get("Frédéric Chopin")! },
    { title: "Scherzo No. 2 in B-flat minor", composerId: composerMap.get("Frédéric Chopin")! },
    { title: "Piano Sonata No. 2 in B-flat minor", composerId: composerMap.get("Frédéric Chopin")! },
    { title: "Études, Op. 10", composerId: composerMap.get("Frédéric Chopin")! },
    { title: "Nocturnes, Op. 9", composerId: composerMap.get("Frédéric Chopin")! },
    { title: "Piano Concerto No. 1 in E minor", composerId: composerMap.get("Frédéric Chopin")! },
    
    { title: "Suite bergamasque", composerId: composerMap.get("Claude Debussy")! },
    { title: "Images, Book I", composerId: composerMap.get("Claude Debussy")! },
    { title: "Préludes, Book I", composerId: composerMap.get("Claude Debussy")! },
    { title: "L'isle joyeuse", composerId: composerMap.get("Claude Debussy")! },
    
    { title: "Sonata in B minor", composerId: composerMap.get("Franz Liszt")! },
    { title: "Transcendental Études", composerId: composerMap.get("Franz Liszt")! },
    { title: "Hungarian Rhapsody No. 2", composerId: composerMap.get("Franz Liszt")! },
    { title: "Liebesträume", composerId: composerMap.get("Franz Liszt")! },
    
    { title: "Piano Sonata No. 11 in A major", composerId: composerMap.get("Wolfgang Amadeus Mozart")! },
    { title: "Piano Concerto No. 21 in C major", composerId: composerMap.get("Wolfgang Amadeus Mozart")! },
    { title: "Fantasia in D minor", composerId: composerMap.get("Wolfgang Amadeus Mozart")! },
    
    { title: "Piano Concerto No. 2 in C minor", composerId: composerMap.get("Sergei Rachmaninoff")! },
    { title: "Piano Concerto No. 3 in D minor", composerId: composerMap.get("Sergei Rachmaninoff")! },
    { title: "Preludes, Op. 23", composerId: composerMap.get("Sergei Rachmaninoff")! },
    
    { title: "Gaspard de la nuit", composerId: composerMap.get("Maurice Ravel")! },
    { title: "Miroirs", composerId: composerMap.get("Maurice Ravel")! },
    { title: "Jeux d'eau", composerId: composerMap.get("Maurice Ravel")! },
    
    { title: "Piano Sonata No. 5", composerId: composerMap.get("Alexander Scriabin")! },
    { title: "Études, Op. 8", composerId: composerMap.get("Alexander Scriabin")! },
    
    { title: "Carnaval, Op. 9", composerId: composerMap.get("Robert Schumann")! },
    { title: "Kreisleriana, Op. 16", composerId: composerMap.get("Robert Schumann")! },
    { title: "Kinderszenen, Op. 15", composerId: composerMap.get("Robert Schumann")! },
    
    { title: "Impromptus, D. 899", composerId: composerMap.get("Franz Schubert")! },
    { title: "Piano Sonata No. 21 in B-flat major 'Wanderer'", composerId: composerMap.get("Franz Schubert")! },
    
    { title: "Piano Concerto No. 1 in D minor", composerId: composerMap.get("Johannes Brahms")! },
    { title: "Intermezzi, Op. 117", composerId: composerMap.get("Johannes Brahms")! },
    
    { title: "Piano Concerto No. 1 in B-flat minor", composerId: composerMap.get("Pyotr Ilyich Tchaikovsky")! },
    { title: "The Seasons, Op. 37a", composerId: composerMap.get("Pyotr Ilyich Tchaikovsky")! },
    
    { title: "Piano Concerto No. 3 in C major", composerId: composerMap.get("Sergei Prokofiev")! },
    { title: "Piano Sonata No. 7 in B-flat major", composerId: composerMap.get("Sergei Prokofiev")! },
    { title: "Toccata in D minor, Op. 11", composerId: composerMap.get("Sergei Prokofiev")! },
    
    { title: "Keyboard Sonata in D minor, K. 9", composerId: composerMap.get("Domenico Scarlatti")! },
    
    { title: "Vingt Regards sur l'Enfant-Jésus", composerId: composerMap.get("Olivier Messiaen")! },
    
    { title: "Études for Piano", composerId: composerMap.get("György Ligeti")! },
    
    { title: "Mikrokosmos", composerId: composerMap.get("Béla Bartók")! },
    { title: "Allegro barbaro", composerId: composerMap.get("Béla Bartók")! },
  ];

  const insertedPieces = await db.insert(pieces).values(pieceData).returning();
  console.log(`Auto-seeded ${insertedPieces.length} pieces`);

  const pieceMap = new Map(insertedPieces.map(p => [p.title, p.id]));

  const movementData = [
    { name: "I. Allegro con brio", pieceId: pieceMap.get("Piano Sonata No. 23 'Appassionata'")! },
    { name: "II. Andante con moto", pieceId: pieceMap.get("Piano Sonata No. 23 'Appassionata'")! },
    { name: "III. Allegro ma non troppo", pieceId: pieceMap.get("Piano Sonata No. 23 'Appassionata'")! },
    { name: "I. Moderato", pieceId: pieceMap.get("Piano Concerto No. 3 in D minor")! },
    { name: "II. Adagio sostenuto", pieceId: pieceMap.get("Piano Concerto No. 3 in D minor")! },
    { name: "III. Allegro scherzando", pieceId: pieceMap.get("Piano Concerto No. 3 in D minor")! },
    { name: "I. Ondine", pieceId: pieceMap.get("Gaspard de la nuit")! },
    { name: "II. Le Gibet", pieceId: pieceMap.get("Gaspard de la nuit")! },
    { name: "III. Scarbo", pieceId: pieceMap.get("Gaspard de la nuit")! },
    { name: "I. Prélude", pieceId: pieceMap.get("Suite bergamasque")! },
    { name: "II. Menuet", pieceId: pieceMap.get("Suite bergamasque")! },
    { name: "III. Clair de lune", pieceId: pieceMap.get("Suite bergamasque")! },
    { name: "IV. Passepied", pieceId: pieceMap.get("Suite bergamasque")! },
  ];

  await db.insert(movements).values(movementData);
  console.log(`Auto-seeded ${movementData.length} movements`);

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
    { userId: userMap.get("niraj_suresh")!, displayName: "Niraj Suresh", instrument: "Piano", level: "Serious Amateur", location: "Boston, USA", bio: "Classical pianist specializing in the Romantic and Impressionist eras.", avatarUrl: "/images/niraj.png" },
    { userId: userMap.get("maria_chen")!, displayName: "Maria Chen", instrument: "Piano", level: "Professional", location: "San Francisco, USA", bio: "Concert pianist and pedagogue. Juilliard graduate.", avatarUrl: null },
    { userId: userMap.get("alex_petrov")!, displayName: "Alexander Petrov", instrument: "Piano", level: "Advanced Student", location: "Moscow, Russia", bio: "Currently studying at the Moscow Conservatory.", avatarUrl: null },
    { userId: userMap.get("elena_volkov")!, displayName: "Elena Volkov", instrument: "Piano", level: "Professional", location: "Vienna, Austria", bio: "Chamber musician and soloist.", avatarUrl: null },
    { userId: userMap.get("david_kim")!, displayName: "David Kim", instrument: "Piano", level: "Hobbyist", location: "Seoul, South Korea", bio: "Software engineer by day, pianist by night.", avatarUrl: null },
    { userId: userMap.get("sophia_martin")!, displayName: "Sophia Martin", instrument: "Piano", level: "Serious Amateur", location: "Paris, France", bio: "Medical doctor with a passion for French Impressionism.", avatarUrl: null },
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
    { title: "Chopin Etude Challenge", description: "Learn and post bars 36-74 of Chopin Etude Op. 10 No. 2. Focus on evenness and clarity.", pieceId: pieceMap.get("Études, Op. 10"), startMeasure: 36, endMeasure: 74, deadline: "2026-03-01", isActive: true },
    { title: "Sight-Reading Sprint", description: "Post a video of yourself sight-reading any Scarlatti sonata. No preparation allowed!", deadline: "2026-02-28", isActive: true },
    { title: "Debussy Impressions", description: "Record and share any movement from Debussy's Images. Let's explore the colors together.", pieceId: pieceMap.get("Images, Book I"), deadline: "2026-03-15", isActive: true },
    { title: "Slow Practice Showcase", description: "Post a video practicing any difficult passage at half tempo. Show your process!", deadline: "2026-02-20", isActive: true },
  ];

  await db.insert(challenges).values(challengeData);
  console.log(`Auto-seeded ${challengeData.length} challenges`);

  console.log("Auto-seeding complete!");
}
