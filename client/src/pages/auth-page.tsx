import { useState } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocation, Link } from "wouter";

export default function AuthPage() {
  const [location] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const defaultTab = searchParams.get("tab") || "login";
  
  // Mock login function
  const [, setLocation] = useLocation();
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    // Simulate login success
    setLocation("/profile");
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    // Simulate register success -> go to setup
    setLocation("/profile-setup");
  };

  return (
    <div className="min-h-screen grid grid-cols-1 md:grid-cols-2">
      {/* Left Side - Artistic Image */}
      <div className="hidden md:block relative h-full bg-primary overflow-hidden">
        <div className="absolute inset-0">
          <img 
            src="/hero-classical.png" 
            alt="Classical Instrument" 
            className="w-full h-full object-cover opacity-80 mix-blend-overlay grayscale"
          />
        </div>
        <div className="relative z-10 h-full flex flex-col justify-between p-12 text-white">
          <Link href="/">
             <div className="flex items-center gap-2 cursor-pointer">
              <span className="font-serif text-2xl font-bold">Réperto</span>
            </div>
          </Link>
          <blockquote className="max-w-md">
            <p className="font-serif text-3xl leading-relaxed italic mb-6">
              "Music is the silence between the notes."
            </p>
            <footer className="text-sm uppercase tracking-widest opacity-70">— Claude Debussy</footer>
          </blockquote>
        </div>
      </div>

      {/* Right Side - Form */}
      <div className="flex items-center justify-center p-6 md:p-12 bg-background">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center md:hidden mb-8">
            <Link href="/">
              <span className="font-serif text-3xl font-bold text-primary">Réperto</span>
            </Link>
          </div>

          <Tabs defaultValue={defaultTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-8 bg-muted/50 p-1">
              <TabsTrigger value="login" className="font-serif text-lg">Log In</TabsTrigger>
              <TabsTrigger value="register" className="font-serif text-lg">Sign Up</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <Card className="border-0 shadow-none bg-transparent">
                <CardHeader className="px-0 pt-0">
                  <CardTitle className="font-serif text-3xl mb-2">Welcome Back</CardTitle>
                  <CardDescription>Enter your credentials to access your repertoire.</CardDescription>
                </CardHeader>
                <CardContent className="px-0 space-y-4">
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input id="email" type="email" placeholder="m.arich@orchestra.com" required className="h-12 bg-white/50" />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="password">Password</Label>
                        <Link href="#" className="text-xs text-primary underline-offset-4 hover:underline">Forgot password?</Link>
                      </div>
                      <Input id="password" type="password" required className="h-12 bg-white/50" />
                    </div>
                    <Button type="submit" className="w-full h-12 text-lg font-medium mt-6">
                      Log In
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="register">
              <Card className="border-0 shadow-none bg-transparent">
                <CardHeader className="px-0 pt-0">
                  <CardTitle className="font-serif text-3xl mb-2">Create Account</CardTitle>
                  <CardDescription>Join the community of serious musicians.</CardDescription>
                </CardHeader>
                <CardContent className="px-0 space-y-4">
                  <form onSubmit={handleRegister} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="first-name">First Name</Label>
                        <Input id="first-name" required className="h-12 bg-white/50" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="last-name">Last Name</Label>
                        <Input id="last-name" required className="h-12 bg-white/50" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="reg-email">Email</Label>
                      <Input id="reg-email" type="email" required className="h-12 bg-white/50" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="reg-password">Password</Label>
                      <Input id="reg-password" type="password" required className="h-12 bg-white/50" />
                    </div>
                    <Button type="submit" className="w-full h-12 text-lg font-medium mt-6">
                      Create Account
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}