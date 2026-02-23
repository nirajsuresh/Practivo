const statusBadgeColors: Record<string, string> = {
  "Want to learn": "bg-[#f0ebe5] text-[#9a8e7e] border-[#e0d8ce]",
  "Learning": "bg-[#f5e4d8] text-[#a06840] border-[#e8cbb5]",
  "Polishing": "bg-[#f0d5c4] text-[#8b5535] border-[#ddb8a0]",
  "Performance-ready": "bg-[#d4967c]/20 text-[#b06840] border-[#d4967c]",
  "Shelved": "bg-[#e8e6e3] text-[#8a8580] border-[#d5d0cb]",
};

const statusDotColors: Record<string, string> = {
  "Want to learn": "#c4b8aa",
  "Learning": "#d4a88c",
  "Polishing": "#d49070",
  "Performance-ready": "#d4967c",
  "Shelved": "#a8a4a0",
};

export function getStatusColor(status: string): string {
  return statusBadgeColors[status] ?? "bg-muted text-muted-foreground";
}

export function getStatusDotColor(status: string): string {
  return statusDotColors[status] ?? "#94a3b8";
}
