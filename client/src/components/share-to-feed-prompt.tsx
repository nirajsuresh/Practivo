import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export interface ShareToFeedPromptProps {
  open: boolean;
  onClose: () => void;
  /** Short action description, e.g. "Moved to Refining" or "Added to repertoire" */
  actionText: string;
  pieceTitle: string;
  composerName: string;
  pieceId: number;
  postType: "status_change" | "added_piece" | "text";
}

export function ShareToFeedPrompt({
  open,
  onClose,
  actionText,
  pieceTitle,
  composerName,
  pieceId,
  postType,
}: ShareToFeedPromptProps) {
  const { toast } = useToast();
  const [note, setNote] = useState("");
  const [isPosting, setIsPosting] = useState(false);

  const handleSkip = () => {
    setNote("");
    onClose();
  };

  const handlePost = async () => {
    const userId = localStorage.getItem("userId") || "";
    if (!userId) {
      toast({ title: "Not logged in", variant: "destructive" });
      return;
    }
    setIsPosting(true);
    try {
      const content = note.trim() || actionText;
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-id": userId },
        body: JSON.stringify({
          type: postType,
          content,
          pieceId,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || "Failed to post");
      }
      toast({ title: "Shared to your feed!" });
      setNote("");
      onClose();
    } catch (err: any) {
      toast({ title: "Couldn't share", description: err.message, variant: "destructive" });
    } finally {
      setIsPosting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) handleSkip(); }}>
      <SheetContent side="bottom" className="max-w-lg mx-auto rounded-t-xl px-5 pb-8 pt-4">
        <SheetHeader className="mb-3 text-left">
          <SheetTitle className="text-base font-semibold leading-snug">
            Share to your feed?
          </SheetTitle>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{actionText}</span>
            {" — "}
            <span className="font-serif italic">{pieceTitle}</span>
            {composerName && <span className="text-muted-foreground"> by {composerName}</span>}
          </p>
        </SheetHeader>

        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Add a note (optional)…"
          className="min-h-[72px] resize-none mb-4 text-sm"
          rows={3}
        />

        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={handleSkip} disabled={isPosting}>
            <X className="w-3.5 h-3.5 mr-1.5" />
            Skip
          </Button>
          <Button
            size="sm"
            onClick={handlePost}
            disabled={isPosting}
            className="bg-[#d4967c] hover:bg-[#c47a5a] text-white"
          >
            <Send className="w-3.5 h-3.5 mr-1.5" />
            {isPosting ? "Posting…" : "Post"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
