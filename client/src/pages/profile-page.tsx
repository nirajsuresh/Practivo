import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MapPin, Calendar, Plus, MoreHorizontal, Edit2 } from "lucide-react";

export default function ProfilePage() {
  return (
    <Layout>
      <div className="min-h-screen bg-background pb-20">
        {/* Cover Image */}
        <div className="h-64 md:h-80 bg-primary relative overflow-hidden">
          <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1507838153414-b4b713384ebd?q=80&w=2670&auto=format&fit=crop')] bg-cover bg-center opacity-40"></div>
          <div className="absolute inset-0 bg-gradient-to-t from-background/90 to-transparent"></div>
        </div>

        <div className="container mx-auto px-4 -mt-32 relative z-10">
          <div className="flex flex-col md:flex-row items-end gap-6 mb-8">
            <Avatar className="w-40 h-40 border-4 border-background shadow-2xl">
              <AvatarImage src="https://github.com/shadcn.png" />
              <AvatarFallback className="text-4xl font-serif">EC</AvatarFallback>
            </Avatar>
            
            <div className="flex-1 pb-4 text-center md:text-left">
              <h1 className="font-serif text-4xl font-bold text-primary mb-2">Elena Corvin</h1>
              <div className="flex flex-col md:flex-row items-center gap-4 text-muted-foreground mb-4">
                <span className="flex items-center gap-1 font-medium"><span className="text-accent-foreground">Violin</span> • Professional</span>
                <span className="hidden md:inline">•</span>
                <span className="flex items-center gap-1"><MapPin className="w-4 h-4" /> Vienna, Austria</span>
              </div>
            </div>

            <div className="pb-4 flex gap-3">
              <Button variant="outline" className="bg-background/50 backdrop-blur-sm">
                <Edit2 className="w-4 h-4 mr-2" /> Edit Profile
              </Button>
              <Button>Connect</Button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Sidebar */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg font-serif">About</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground leading-relaxed">
                    Orchestral violinist and chamber musician based in Vienna. 
                    Graduate of the Vienna Conservatory. Passionate about late Romantic repertoire 
                    and contemporary Austrian composers.
                  </p>
                </CardContent>
              </Card>

               <Card>
                <CardHeader>
                  <CardTitle className="text-lg font-serif">Upcoming</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-4 items-start">
                    <div className="bg-primary/10 text-primary p-2 rounded text-center min-w-[3.5rem]">
                      <div className="text-xs uppercase font-bold">Mar</div>
                      <div className="text-xl font-bold">12</div>
                    </div>
                    <div>
                      <h4 className="font-medium">Chamber Recital</h4>
                      <p className="text-sm text-muted-foreground">Mozarthaus Vienna</p>
                    </div>
                  </div>
                   <div className="flex gap-4 items-start">
                    <div className="bg-primary/10 text-primary p-2 rounded text-center min-w-[3.5rem]">
                      <div className="text-xs uppercase font-bold">Apr</div>
                      <div className="text-xl font-bold">05</div>
                    </div>
                    <div>
                      <h4 className="font-medium">Symphony Gala</h4>
                      <p className="text-sm text-muted-foreground">Musikverein</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Main Content - Repertoire */}
            <div className="lg:col-span-2">
              <Tabs defaultValue="current" className="w-full">
                <div className="flex items-center justify-between mb-6">
                  <TabsList className="bg-background border">
                    <TabsTrigger value="current">Current</TabsTrigger>
                    <TabsTrigger value="mastered">Mastered</TabsTrigger>
                    <TabsTrigger value="wishlist">Wishlist</TabsTrigger>
                  </TabsList>
                  <Button size="sm" variant="outline" className="gap-2">
                    <Plus className="w-4 h-4" /> Add Piece
                  </Button>
                </div>

                <TabsContent value="current" className="space-y-4">
                  <RepertoireCard 
                    composer="Johannes Brahms"
                    title="Violin Sonata No. 3 in D minor"
                    opus="Op. 108"
                    status="Polishing"
                    progress={85}
                  />
                  <RepertoireCard 
                    composer="J.S. Bach"
                    title="Partita No. 2 in D minor"
                    opus="BWV 1004"
                    status="Learning"
                    progress={40}
                  />
                  <RepertoireCard 
                    composer="Eugène Ysaÿe"
                    title="Sonata No. 3 'Ballade'"
                    opus="Op. 27"
                    status="Memorizing"
                    progress={65}
                  />
                </TabsContent>

                <TabsContent value="mastered">
                   <div className="text-center py-12 text-muted-foreground italic font-serif">
                    Showcasing your mastered works...
                  </div>
                </TabsContent>
                 <TabsContent value="wishlist">
                   <div className="text-center py-12 text-muted-foreground italic font-serif">
                    Pieces you dream of playing...
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

function RepertoireCard({ composer, title, opus, status, progress }: { composer: string, title: string, opus: string, status: string, progress: number }) {
  return (
    <Card className="hover:shadow-md transition-shadow cursor-pointer group">
      <CardContent className="p-6">
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <p className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">{composer}</p>
            <h3 className="font-serif text-xl font-bold text-primary group-hover:text-accent-foreground transition-colors">{title}</h3>
            <p className="text-sm text-muted-foreground font-serif italic">{opus}</p>
          </div>
          <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity">
            <MoreHorizontal className="w-5 h-5" />
          </Button>
        </div>
        
        <div className="mt-6">
          <div className="flex justify-between text-xs mb-2">
             <span className="font-medium text-primary">{status}</span>
             <span className="text-muted-foreground">{progress}%</span>
          </div>
          <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
            <div 
              className="h-full bg-accent rounded-full transition-all duration-500 ease-out" 
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}