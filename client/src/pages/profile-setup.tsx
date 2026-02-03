import { useState } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocation } from "wouter";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export default function ProfileSetup() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState(1);
  const totalSteps = 2;

  const handleNext = () => {
    if (step < totalSteps) {
      setStep(step + 1);
    } else {
      setLocation("/profile");
    }
  };

  return (
    <Layout>
      <div className="min-h-[80vh] py-16 px-4 bg-secondary/30 flex items-center justify-center">
        <div className="w-full max-w-2xl">
          <div className="mb-8 flex items-center justify-center gap-4">
            {[1, 2].map((s) => (
              <div key={s} className="flex items-center">
                <div className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center font-serif font-bold border-2 transition-all",
                  step >= s 
                    ? "bg-primary border-primary text-white" 
                    : "bg-transparent border-muted-foreground/30 text-muted-foreground"
                )}>
                  {step > s ? <Check className="w-5 h-5" /> : s}
                </div>
                {s < totalSteps && (
                  <div className={cn(
                    "w-16 h-0.5 mx-2",
                    step > s ? "bg-primary" : "bg-muted-foreground/30"
                  )} />
                )}
              </div>
            ))}
          </div>

          <Card className="border-none shadow-xl">
            <CardHeader className="text-center pb-8 pt-8">
              <CardTitle className="font-serif text-3xl">
                {step === 1 ? "Your Instrument" : "Your Artist Profile"}
              </CardTitle>
              <CardDescription className="text-lg">
                {step === 1 ? "Let's customize your experience." : "Tell the community about yourself."}
              </CardDescription>
            </CardHeader>
            <CardContent className="px-8 pb-8 space-y-6">
              {step === 1 && (
                <div className="space-y-6">
                  <div className="space-y-3">
                    <Label htmlFor="instrument">Primary Instrument</Label>
                    <Select>
                      <SelectTrigger className="h-12 bg-background">
                        <SelectValue placeholder="Select instrument" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="piano">Piano</SelectItem>
                        <SelectItem value="violin">Violin</SelectItem>
                        <SelectItem value="cello">Cello</SelectItem>
                        <SelectItem value="flute">Flute</SelectItem>
                        <SelectItem value="voice-soprano">Voice (Soprano)</SelectItem>
                        <SelectItem value="voice-tenor">Voice (Tenor)</SelectItem>
                        <SelectItem value="conductor">Conductor</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-3">
                    <Label htmlFor="level">Experience Level</Label>
                    <Select>
                      <SelectTrigger className="h-12 bg-background">
                        <SelectValue placeholder="Select level" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="student">Student</SelectItem>
                        <SelectItem value="conservatory">Conservatory Student</SelectItem>
                        <SelectItem value="professional">Professional</SelectItem>
                        <SelectItem value="amateur">Serious Amateur</SelectItem>
                        <SelectItem value="educator">Educator</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-6">
                  <div className="space-y-3">
                    <Label htmlFor="bio">Bio</Label>
                    <Textarea 
                      id="bio" 
                      placeholder="Share your musical background, education, and current focus..." 
                      className="min-h-[150px] bg-background resize-none leading-relaxed"
                    />
                  </div>
                  
                  <div className="space-y-3">
                    <Label htmlFor="location">Based In</Label>
                    <Input id="location" placeholder="e.g. New York, NY" className="h-12 bg-background" />
                  </div>
                </div>
              )}

              <div className="pt-6 flex justify-end">
                <Button onClick={handleNext} size="lg" className="min-w-[140px]">
                  {step === totalSteps ? "Complete Setup" : "Next"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}