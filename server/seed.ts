import { db } from "./db";
import { composers, pieces, movements } from "@shared/schema";

async function seed() {
  console.log("Seeding database with classical music catalog...");

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
  console.log(`Inserted ${insertedComposers.length} composers`);

  const composerMap = new Map(insertedComposers.map(c => [c.name, c.id]));

  const pieceData = [
    { title: "Well-Tempered Clavier, Book I", composerId: composerMap.get("Johann Sebastian Bach")! },
    { title: "Well-Tempered Clavier, Book II", composerId: composerMap.get("Johann Sebastian Bach")! },
    { title: "Goldberg Variations", composerId: composerMap.get("Johann Sebastian Bach")! },
    { title: "Italian Concerto", composerId: composerMap.get("Johann Sebastian Bach")! },
    { title: "French Suite No. 5 in G major", composerId: composerMap.get("Johann Sebastian Bach")! },
    { title: "English Suite No. 2 in A minor", composerId: composerMap.get("Johann Sebastian Bach")! },
    { title: "Partita No. 2 in C minor", composerId: composerMap.get("Johann Sebastian Bach")! },
    
    { title: "Piano Sonata No. 8 'Pathétique'", composerId: composerMap.get("Ludwig van Beethoven")! },
    { title: "Piano Sonata No. 14 'Moonlight'", composerId: composerMap.get("Ludwig van Beethoven")! },
    { title: "Piano Sonata No. 21 'Waldstein'", composerId: composerMap.get("Ludwig van Beethoven")! },
    { title: "Piano Sonata No. 23 'Appassionata'", composerId: composerMap.get("Ludwig van Beethoven")! },
    { title: "Piano Sonata No. 29 'Hammerklavier'", composerId: composerMap.get("Ludwig van Beethoven")! },
    { title: "Piano Sonata No. 32 in C minor", composerId: composerMap.get("Ludwig van Beethoven")! },
    { title: "Piano Concerto No. 4 in G major", composerId: composerMap.get("Ludwig van Beethoven")! },
    { title: "Piano Concerto No. 5 'Emperor'", composerId: composerMap.get("Ludwig van Beethoven")! },
    { title: "Diabelli Variations", composerId: composerMap.get("Ludwig van Beethoven")! },
    
    { title: "Ballade No. 1 in G minor", composerId: composerMap.get("Frédéric Chopin")! },
    { title: "Ballade No. 2 in F major", composerId: composerMap.get("Frédéric Chopin")! },
    { title: "Ballade No. 3 in A-flat major", composerId: composerMap.get("Frédéric Chopin")! },
    { title: "Ballade No. 4 in F minor", composerId: composerMap.get("Frédéric Chopin")! },
    { title: "Scherzo No. 1 in B minor", composerId: composerMap.get("Frédéric Chopin")! },
    { title: "Scherzo No. 2 in B-flat minor", composerId: composerMap.get("Frédéric Chopin")! },
    { title: "Scherzo No. 3 in C-sharp minor", composerId: composerMap.get("Frédéric Chopin")! },
    { title: "Scherzo No. 4 in E major", composerId: composerMap.get("Frédéric Chopin")! },
    { title: "Piano Sonata No. 2 in B-flat minor", composerId: composerMap.get("Frédéric Chopin")! },
    { title: "Piano Sonata No. 3 in B minor", composerId: composerMap.get("Frédéric Chopin")! },
    { title: "Études, Op. 10", composerId: composerMap.get("Frédéric Chopin")! },
    { title: "Études, Op. 25", composerId: composerMap.get("Frédéric Chopin")! },
    { title: "Polonaise in A-flat major 'Heroic'", composerId: composerMap.get("Frédéric Chopin")! },
    { title: "Polonaise-Fantaisie in A-flat major", composerId: composerMap.get("Frédéric Chopin")! },
    { title: "Nocturnes, Op. 9", composerId: composerMap.get("Frédéric Chopin")! },
    { title: "Nocturnes, Op. 27", composerId: composerMap.get("Frédéric Chopin")! },
    { title: "Piano Concerto No. 1 in E minor", composerId: composerMap.get("Frédéric Chopin")! },
    { title: "Piano Concerto No. 2 in F minor", composerId: composerMap.get("Frédéric Chopin")! },
    
    { title: "Suite bergamasque", composerId: composerMap.get("Claude Debussy")! },
    { title: "Images, Book I", composerId: composerMap.get("Claude Debussy")! },
    { title: "Images, Book II", composerId: composerMap.get("Claude Debussy")! },
    { title: "Préludes, Book I", composerId: composerMap.get("Claude Debussy")! },
    { title: "Préludes, Book II", composerId: composerMap.get("Claude Debussy")! },
    { title: "Estampes", composerId: composerMap.get("Claude Debussy")! },
    { title: "L'isle joyeuse", composerId: composerMap.get("Claude Debussy")! },
    { title: "Pour le piano", composerId: composerMap.get("Claude Debussy")! },
    { title: "Children's Corner", composerId: composerMap.get("Claude Debussy")! },
    
    { title: "Sonata in B minor", composerId: composerMap.get("Franz Liszt")! },
    { title: "Années de pèlerinage: Première année (Suisse)", composerId: composerMap.get("Franz Liszt")! },
    { title: "Années de pèlerinage: Deuxième année (Italie)", composerId: composerMap.get("Franz Liszt")! },
    { title: "Hungarian Rhapsody No. 2", composerId: composerMap.get("Franz Liszt")! },
    { title: "Hungarian Rhapsody No. 6", composerId: composerMap.get("Franz Liszt")! },
    { title: "Transcendental Études", composerId: composerMap.get("Franz Liszt")! },
    { title: "Mephisto Waltz No. 1", composerId: composerMap.get("Franz Liszt")! },
    { title: "Piano Concerto No. 1 in E-flat major", composerId: composerMap.get("Franz Liszt")! },
    { title: "Piano Concerto No. 2 in A major", composerId: composerMap.get("Franz Liszt")! },
    { title: "Liebesträume", composerId: composerMap.get("Franz Liszt")! },
    
    { title: "Piano Sonata No. 11 in A major", composerId: composerMap.get("Wolfgang Amadeus Mozart")! },
    { title: "Piano Sonata No. 14 in C minor", composerId: composerMap.get("Wolfgang Amadeus Mozart")! },
    { title: "Piano Sonata No. 16 in C major", composerId: composerMap.get("Wolfgang Amadeus Mozart")! },
    { title: "Piano Concerto No. 20 in D minor", composerId: composerMap.get("Wolfgang Amadeus Mozart")! },
    { title: "Piano Concerto No. 21 in C major", composerId: composerMap.get("Wolfgang Amadeus Mozart")! },
    { title: "Piano Concerto No. 23 in A major", composerId: composerMap.get("Wolfgang Amadeus Mozart")! },
    { title: "Piano Concerto No. 24 in C minor", composerId: composerMap.get("Wolfgang Amadeus Mozart")! },
    { title: "Fantasia in D minor", composerId: composerMap.get("Wolfgang Amadeus Mozart")! },
    { title: "Rondo alla Turca", composerId: composerMap.get("Wolfgang Amadeus Mozart")! },
    
    { title: "Piano Concerto No. 2 in C minor", composerId: composerMap.get("Sergei Rachmaninoff")! },
    { title: "Piano Concerto No. 3 in D minor", composerId: composerMap.get("Sergei Rachmaninoff")! },
    { title: "Rhapsody on a Theme of Paganini", composerId: composerMap.get("Sergei Rachmaninoff")! },
    { title: "Preludes, Op. 23", composerId: composerMap.get("Sergei Rachmaninoff")! },
    { title: "Preludes, Op. 32", composerId: composerMap.get("Sergei Rachmaninoff")! },
    { title: "Études-Tableaux, Op. 33", composerId: composerMap.get("Sergei Rachmaninoff")! },
    { title: "Études-Tableaux, Op. 39", composerId: composerMap.get("Sergei Rachmaninoff")! },
    { title: "Piano Sonata No. 2 in B-flat minor", composerId: composerMap.get("Sergei Rachmaninoff")! },
    { title: "Moments Musicaux, Op. 16", composerId: composerMap.get("Sergei Rachmaninoff")! },
    
    { title: "Gaspard de la nuit", composerId: composerMap.get("Maurice Ravel")! },
    { title: "Miroirs", composerId: composerMap.get("Maurice Ravel")! },
    { title: "Jeux d'eau", composerId: composerMap.get("Maurice Ravel")! },
    { title: "Sonatine", composerId: composerMap.get("Maurice Ravel")! },
    { title: "Pavane pour une infante défunte", composerId: composerMap.get("Maurice Ravel")! },
    { title: "Valses nobles et sentimentales", composerId: composerMap.get("Maurice Ravel")! },
    { title: "Le Tombeau de Couperin", composerId: composerMap.get("Maurice Ravel")! },
    { title: "Piano Concerto in G major", composerId: composerMap.get("Maurice Ravel")! },
    { title: "Piano Concerto for the Left Hand", composerId: composerMap.get("Maurice Ravel")! },
    
    { title: "Piano Sonata No. 2 in G-sharp minor", composerId: composerMap.get("Alexander Scriabin")! },
    { title: "Piano Sonata No. 3 in F-sharp minor", composerId: composerMap.get("Alexander Scriabin")! },
    { title: "Piano Sonata No. 4 in F-sharp major", composerId: composerMap.get("Alexander Scriabin")! },
    { title: "Piano Sonata No. 5", composerId: composerMap.get("Alexander Scriabin")! },
    { title: "Piano Sonata No. 9 'Black Mass'", composerId: composerMap.get("Alexander Scriabin")! },
    { title: "Piano Sonata No. 10", composerId: composerMap.get("Alexander Scriabin")! },
    { title: "Études, Op. 8", composerId: composerMap.get("Alexander Scriabin")! },
    { title: "Études, Op. 42", composerId: composerMap.get("Alexander Scriabin")! },
    { title: "Poem of Ecstasy (piano transcription)", composerId: composerMap.get("Alexander Scriabin")! },
    
    { title: "Carnaval, Op. 9", composerId: composerMap.get("Robert Schumann")! },
    { title: "Kreisleriana, Op. 16", composerId: composerMap.get("Robert Schumann")! },
    { title: "Fantasie in C major, Op. 17", composerId: composerMap.get("Robert Schumann")! },
    { title: "Kinderszenen, Op. 15", composerId: composerMap.get("Robert Schumann")! },
    { title: "Davidsbündlertänze, Op. 6", composerId: composerMap.get("Robert Schumann")! },
    { title: "Piano Concerto in A minor", composerId: composerMap.get("Robert Schumann")! },
    { title: "Symphonic Études, Op. 13", composerId: composerMap.get("Robert Schumann")! },
    
    { title: "Piano Sonata No. 21 in B-flat major 'Wanderer'", composerId: composerMap.get("Franz Schubert")! },
    { title: "Piano Sonata No. 20 in A major", composerId: composerMap.get("Franz Schubert")! },
    { title: "Impromptus, D. 899", composerId: composerMap.get("Franz Schubert")! },
    { title: "Impromptus, D. 935", composerId: composerMap.get("Franz Schubert")! },
    { title: "Moments musicaux, D. 780", composerId: composerMap.get("Franz Schubert")! },
    
    { title: "Piano Concerto No. 1 in D minor", composerId: composerMap.get("Johannes Brahms")! },
    { title: "Piano Concerto No. 2 in B-flat major", composerId: composerMap.get("Johannes Brahms")! },
    { title: "Variations on a Theme by Paganini", composerId: composerMap.get("Johannes Brahms")! },
    { title: "Variations on a Theme by Handel", composerId: composerMap.get("Johannes Brahms")! },
    { title: "Piano Sonata No. 3 in F minor", composerId: composerMap.get("Johannes Brahms")! },
    { title: "Intermezzi, Op. 117", composerId: composerMap.get("Johannes Brahms")! },
    { title: "Klavierstücke, Op. 118", composerId: composerMap.get("Johannes Brahms")! },
    { title: "Klavierstücke, Op. 119", composerId: composerMap.get("Johannes Brahms")! },
    
    { title: "Piano Concerto No. 1 in B-flat minor", composerId: composerMap.get("Pyotr Ilyich Tchaikovsky")! },
    { title: "The Seasons, Op. 37a", composerId: composerMap.get("Pyotr Ilyich Tchaikovsky")! },
    { title: "Dumka, Op. 59", composerId: composerMap.get("Pyotr Ilyich Tchaikovsky")! },
    
    { title: "Piano Concerto No. 1 in D-flat major", composerId: composerMap.get("Sergei Prokofiev")! },
    { title: "Piano Concerto No. 2 in G minor", composerId: composerMap.get("Sergei Prokofiev")! },
    { title: "Piano Concerto No. 3 in C major", composerId: composerMap.get("Sergei Prokofiev")! },
    { title: "Piano Sonata No. 6 in A major", composerId: composerMap.get("Sergei Prokofiev")! },
    { title: "Piano Sonata No. 7 in B-flat major", composerId: composerMap.get("Sergei Prokofiev")! },
    { title: "Piano Sonata No. 8 in B-flat major", composerId: composerMap.get("Sergei Prokofiev")! },
    { title: "Toccata in D minor, Op. 11", composerId: composerMap.get("Sergei Prokofiev")! },
    { title: "Suggestion Diabolique, Op. 4", composerId: composerMap.get("Sergei Prokofiev")! },
    { title: "Romeo and Juliet (piano excerpts)", composerId: composerMap.get("Sergei Prokofiev")! },
    
    { title: "Keyboard Sonata in D minor, K. 9", composerId: composerMap.get("Domenico Scarlatti")! },
    { title: "Keyboard Sonata in E major, K. 380", composerId: composerMap.get("Domenico Scarlatti")! },
    { title: "Keyboard Sonata in D major, K. 119", composerId: composerMap.get("Domenico Scarlatti")! },
    { title: "Keyboard Sonata in G major, K. 455", composerId: composerMap.get("Domenico Scarlatti")! },
    
    { title: "Vingt Regards sur l'Enfant-Jésus", composerId: composerMap.get("Olivier Messiaen")! },
    { title: "Catalogue d'oiseaux", composerId: composerMap.get("Olivier Messiaen")! },
    { title: "Préludes", composerId: composerMap.get("Olivier Messiaen")! },
    
    { title: "Études for Piano", composerId: composerMap.get("György Ligeti")! },
    { title: "Musica ricercata", composerId: composerMap.get("György Ligeti")! },
    
    { title: "Mikrokosmos", composerId: composerMap.get("Béla Bartók")! },
    { title: "Piano Concerto No. 2", composerId: composerMap.get("Béla Bartók")! },
    { title: "Piano Concerto No. 3", composerId: composerMap.get("Béla Bartók")! },
    { title: "Out of Doors", composerId: composerMap.get("Béla Bartók")! },
    { title: "Allegro barbaro", composerId: composerMap.get("Béla Bartók")! },
  ];

  const insertedPieces = await db.insert(pieces).values(pieceData).returning();
  console.log(`Inserted ${insertedPieces.length} pieces`);

  const pieceMap = new Map(insertedPieces.map(p => [p.title, p.id]));

  const movementData = [
    { name: "Prelude No. 1 in C major", pieceId: pieceMap.get("Well-Tempered Clavier, Book I")! },
    { name: "Fugue No. 1 in C major", pieceId: pieceMap.get("Well-Tempered Clavier, Book I")! },
    { name: "Prelude No. 2 in C minor", pieceId: pieceMap.get("Well-Tempered Clavier, Book I")! },
    { name: "Fugue No. 2 in C minor", pieceId: pieceMap.get("Well-Tempered Clavier, Book I")! },
    
    { name: "I. Allegro con brio", pieceId: pieceMap.get("Piano Sonata No. 23 'Appassionata'")! },
    { name: "II. Andante con moto", pieceId: pieceMap.get("Piano Sonata No. 23 'Appassionata'")! },
    { name: "III. Allegro ma non troppo - Presto", pieceId: pieceMap.get("Piano Sonata No. 23 'Appassionata'")! },
    
    { name: "I. Moderato", pieceId: pieceMap.get("Piano Concerto No. 2 in C minor")! },
    { name: "II. Adagio sostenuto", pieceId: pieceMap.get("Piano Concerto No. 2 in C minor")! },
    { name: "III. Allegro scherzando", pieceId: pieceMap.get("Piano Concerto No. 2 in C minor")! },
    
    { name: "I. Allegro ma non tanto", pieceId: pieceMap.get("Piano Concerto No. 3 in D minor")! },
    { name: "II. Intermezzo: Adagio", pieceId: pieceMap.get("Piano Concerto No. 3 in D minor")! },
    { name: "III. Finale: Alla breve", pieceId: pieceMap.get("Piano Concerto No. 3 in D minor")! },
    
    { name: "I. Ondine", pieceId: pieceMap.get("Gaspard de la nuit")! },
    { name: "II. Le Gibet", pieceId: pieceMap.get("Gaspard de la nuit")! },
    { name: "III. Scarbo", pieceId: pieceMap.get("Gaspard de la nuit")! },
    
    { name: "I. Reflets dans l'eau", pieceId: pieceMap.get("Images, Book I")! },
    { name: "II. Hommage à Rameau", pieceId: pieceMap.get("Images, Book I")! },
    { name: "III. Mouvement", pieceId: pieceMap.get("Images, Book I")! },
    
    { name: "I. Cloches à travers les feuilles", pieceId: pieceMap.get("Images, Book II")! },
    { name: "II. Et la lune descend sur le temple qui fut", pieceId: pieceMap.get("Images, Book II")! },
    { name: "III. Poissons d'or", pieceId: pieceMap.get("Images, Book II")! },
    
    { name: "Étude No. 1 in C major 'Waterfall'", pieceId: pieceMap.get("Études, Op. 10")! },
    { name: "Étude No. 3 in E major 'Tristesse'", pieceId: pieceMap.get("Études, Op. 10")! },
    { name: "Étude No. 4 in C-sharp minor 'Torrent'", pieceId: pieceMap.get("Études, Op. 10")! },
    { name: "Étude No. 5 in G-flat major 'Black Keys'", pieceId: pieceMap.get("Études, Op. 10")! },
    { name: "Étude No. 12 in C minor 'Revolutionary'", pieceId: pieceMap.get("Études, Op. 10")! },
    
    { name: "Étude No. 1 in A-flat major 'Aeolian Harp'", pieceId: pieceMap.get("Études, Op. 25")! },
    { name: "Étude No. 5 in E minor 'Wrong Note'", pieceId: pieceMap.get("Études, Op. 25")! },
    { name: "Étude No. 11 in A minor 'Winter Wind'", pieceId: pieceMap.get("Études, Op. 25")! },
    { name: "Étude No. 12 in C minor 'Ocean'", pieceId: pieceMap.get("Études, Op. 25")! },
    
    { name: "I. Prélude", pieceId: pieceMap.get("Suite bergamasque")! },
    { name: "II. Menuet", pieceId: pieceMap.get("Suite bergamasque")! },
    { name: "III. Clair de lune", pieceId: pieceMap.get("Suite bergamasque")! },
    { name: "IV. Passepied", pieceId: pieceMap.get("Suite bergamasque")! },
    
    { name: "Nocturne No. 1 in B-flat minor", pieceId: pieceMap.get("Nocturnes, Op. 9")! },
    { name: "Nocturne No. 2 in E-flat major", pieceId: pieceMap.get("Nocturnes, Op. 9")! },
    { name: "Nocturne No. 3 in B major", pieceId: pieceMap.get("Nocturnes, Op. 9")! },
    
    { name: "Nocturne No. 7 in C-sharp minor", pieceId: pieceMap.get("Nocturnes, Op. 27")! },
    { name: "Nocturne No. 8 in D-flat major", pieceId: pieceMap.get("Nocturnes, Op. 27")! },
  ];

  const insertedMovements = await db.insert(movements).values(movementData).returning();
  console.log(`Inserted ${insertedMovements.length} movements`);

  console.log("Seeding complete!");
}

seed().catch(console.error).finally(() => process.exit(0));
