export type PopularClip = {
  title: string;
  creatorName: string;
  viewCount: number;
  likeCount: number;
  thumbnailUrl: string | null;
};

export type TopCreator = {
  creatorName: string;
  clipCount: number;
  totalViews: number;
};

export type LandingStats = {
  popularClips: PopularClip[];
  topCreators: TopCreator[];
};

// Popular Clips and Top Creators both mount on the landing page and used to each
// call this endpoint. One shared promise means one request, and a failure clears
// the cache so a later visit can retry.
let inflight: Promise<LandingStats> | null = null;

export function loadLandingStats(): Promise<LandingStats> {
  if (!inflight) {
    inflight = fetch("/api/public/landing-stats")
      .then((res) => {
        if (!res.ok) throw new Error("landing stats failed");
        return res.json() as Promise<LandingStats>;
      })
      .catch((error) => {
        inflight = null;
        throw error;
      });
  }
  return inflight;
}
