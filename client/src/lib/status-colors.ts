const statusBadgeColors: Record<string, string> = {
  "Want to learn": "bg-[#b8c8bf]/20 text-[#5a6e62] border-[#b8c8bf]",
  "Learning": "bg-[#8fa79a]/20 text-[#3d5a4e] border-[#8fa79a]",
  "Polishing": "bg-[#d4967c]/20 text-[#8b5535] border-[#d4967c]",
  "Performance-ready": "bg-[#c88264]/20 text-[#7a4530] border-[#c88264]",
  "Shelved": "bg-[#8e8b88]/20 text-[#5a5855] border-[#8e8b88]",
};

const statusDotColors: Record<string, string> = {
  "Want to learn": "#b8c8bf",
  "Learning": "#8fa79a",
  "Polishing": "#d4967c",
  "Performance-ready": "#c88264",
  "Shelved": "#8e8b88",
};

export function getStatusColor(status: string): string {
  return statusBadgeColors[status] ?? "bg-muted text-muted-foreground";
}

export function getStatusDotColor(status: string): string {
  return statusDotColors[status] ?? "#94a3b8";
}
