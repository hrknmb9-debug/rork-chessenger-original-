export type SkillLevel = 'beginner' | 'intermediate' | 'advanced' | 'expert';

export type PlayStyle = 'casual' | 'beginner_welcome' | 'competitive' | 'spectator_welcome' | 'tournament';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface Player {
  id: string;
  name: string;
  avatar: string;
  rating: number;
  chessComRating: number | null;
  lichessRating: number | null;
  skillLevel: SkillLevel;
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  distance: number;
  isOnline: boolean;
  lastActive: string;
  bio: string;
  bioEn: string;
  preferredTimeControl: string;
  location: string;
  coordinates: Coordinates;
  languages: string[];
  country?: string;
  playStyles?: PlayStyle[];
  lastSeen?: string;
}

export type MatchStatus = 'pending' | 'accepted' | 'declined' | 'completed' | 'cancelled';

export interface MatchRating {
  sportsmanship: number;
  skillAccuracy: number;
  punctuality: number;
  comment: string;
}

export interface Match {
  id: string;
  opponent: Player;
  status: MatchStatus;
  requestedAt: string;
  scheduledAt?: string;
  location?: string;
  timeControl: string;
  result?: 'win' | 'loss' | 'draw';
  isIncoming: boolean;
  rating?: MatchRating;
}

export interface UserProfile extends Player {
  email: string;
  joinedDate: string;
  country?: string;
}

export interface TimelineEvent {
  id: string;
  userId: string;
  title: string;
  date: string;
  time: string;
  location: string;
  maxParticipants: number;
  participants: string[];
  createdAt: string;
  /** 募集締め切り日時（ISO）。過ぎているか closed_at が設定されていると参加不可 */
  deadlineAt?: string | null;
  /** 手動で締め切られた日時（設定時は参加不可） */
  isClosed?: boolean;
}

export interface TimelinePost {
  id: string;
  author: Player;
  type: 'match_result' | 'achievement' | 'looking_for_match' | 'general' | 'event';
  content: string;
  contentEn?: string;
  imageUrl?: string;
  templateType?: string;
  createdAt: string;
  likes: string[];
  comments: TimelineComment[];
  matchResult?: {
    opponent: Player;
    result: 'win' | 'loss' | 'draw';
    timeControl: string;
  };
  event?: TimelineEvent;
}

export interface TimelineComment {
  id: string;
  author: Player;
  content: string;
  contentEn?: string;
  createdAt: string;
  parentId?: string;
  replies?: TimelineComment[];
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatar: string;
  isLoggedIn: boolean;
  chessComRating?: number | null;
  bio?: string;
}

export interface Message {
  id: string;
  senderId: string;
  text: string;
  textEn?: string;
  timestamp: string;
  read: boolean;
  imageUrl?: string;
  reactions?: string[];
}

export interface Conversation {
  id: string;
  player: Player;
  lastMessage: Message;
  messages: Message[];
  unreadCount: number;
}

export interface MatchResultReport {
  id: string;
  matchId: string;
  reporterId: string;
  reporterName: string;
  result: 'win' | 'loss' | 'draw';
  opponentId: string;
  opponentName: string;
  createdAt: string;
  status: 'pending' | 'confirmed' | 'disputed';
}

export interface AppNotification {
  id: string;
  type: 'match_request' | 'match_accepted' | 'match_declined' | 'result_report' | 'result_confirmed' | 'blocked' | 'new_message' | 'post_like' | 'post_comment' | 'post_reply' | 'event_join' | 'event_full' | 'event_deadline_passed';
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
  relatedId?: string;
}
