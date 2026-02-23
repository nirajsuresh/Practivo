import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { ArrowRight, Music, Users, BookOpen } from "lucide-react";
import { motion } from "framer-motion";

export default function LandingPage() {
  return (
    <Layout>
      {/* HERO SECTION */}
      <section className="relative h-[90vh] flex items-center justify-center overflow-hidden">
        {/* Background Image with Overlay */}
        <div className="absolute inset-0 z-0">
          <img 
            src="/images/hero-piano-studio.png" 
            alt="Classical Piano in Music Studio" 
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-black/30 mix-blend-multiply" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
        </div>

        {/* Content */}
        <div className="relative z-10 container mx-auto px-4 text-center text-white max-w-4xl">
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="font-serif text-5xl md:text-7xl lg:text-8xl font-bold mb-6 leading-tight tracking-tight text-white"
          >
            Own your musical journey.
          </motion.h1>
          
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
            className="text-lg md:text-xl text-white/90 mb-10 max-w-2xl mx-auto font-light leading-relaxed"
          >
            Manage your repertoire, record your progress, and grow alongside other serious musicians.
          </motion.p>
          
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4, ease: "easeOut" }}
          >
            <Link href="/auth?tab=register">
              <Button size="lg" className="h-14 px-8 text-lg rounded-full bg-white text-black hover:bg-white/90 border-0 shadow-2xl transition-transform hover:scale-105">
                Start Your Journey
              </Button>
            </Link>
          </motion.div>
        </div>
      </section>

      {/* VALUE PROP SECTION */}
      <section className="py-24 md:py-32 bg-background">
        <div className="container mx-auto px-4">
          <div className="text-center mb-20">
            <h2 className="font-serif text-4xl md:text-5xl font-bold mb-6 text-primary">Designed for the Dedication</h2>
            <div className="w-24 h-1 bg-accent mx-auto" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-16">
            <FeatureCard 
              icon={<BookOpen className="w-8 h-8" />}
              title="Repertoire Tracking"
              description="Keep a detailed log of every etude, sonata, and concerto you've mastered, currently practicing, or wish to learn."
            />
            <FeatureCard 
              icon={<Users className="w-8 h-8" />}
              title="Connect & Collaborate"
              description="Find accompanists, chamber partners, and peers who share your passion and dedication to the craft."
            />
            <FeatureCard 
              icon={<Music className="w-8 h-8" />}
              title="Performance History"
              description="Build a verified timeline of your recitals, competitions, and masterclasses to showcase your experience."
            />
          </div>
        </div>
      </section>

      {/* CTA SECTION */}
      <section className="py-24 bg-primary text-primary-foreground relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')]"></div>
        <div className="container mx-auto px-4 text-center relative z-10">
          <h2 className="font-serif text-4xl md:text-5xl font-bold mb-8">Ready to Organize Your Artistry?</h2>
          <p className="text-primary-foreground/80 text-xl mb-10 max-w-2xl mx-auto">
            Join thousands of cellists, pianists, violinists, and vocalists who trust Réperto with their musical legacy.
          </p>
          <Link href="/auth?tab=register">
            <Button size="lg" className="h-14 px-10 text-lg rounded-full bg-accent text-accent-foreground hover:bg-accent/90 border-0">
              Create Free Account <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
          </Link>
        </div>
      </section>
    </Layout>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
  return (
    <div className="flex flex-col items-center text-center group">
      <div className="w-16 h-16 rounded-full bg-secondary/50 flex items-center justify-center text-primary mb-6 transition-colors group-hover:bg-accent/20 group-hover:text-accent-foreground">
        {icon}
      </div>
      <h3 className="font-serif text-2xl font-bold mb-4">{title}</h3>
      <p className="text-muted-foreground leading-relaxed">{description}</p>
    </div>
  );
}