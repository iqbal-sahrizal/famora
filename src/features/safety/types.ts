export type SafetyContactType = "emergency" | "trusted";
export type SafetyProtocolCategory =
  | "emergency_info"
  | "procedure"
  | "safety_note";

export interface SafetyContactItem {
  id: string;
  contactType: SafetyContactType;
  name: string;
  relationship: string;
  phone: string;
  email: string;
  notes: string;
  isPrimary: boolean;
}

export interface SafetyProtocolItem {
  id: string;
  category: SafetyProtocolCategory;
  title: string;
  content: string;
  createdAt: string;
}

export interface LocationShareItem {
  id: string;
  memberId: string;
  memberName: string;
  isEnabled: boolean;
  consentAcknowledgedAt: string | null;
  expiresAt: string | null;
  sharedWithMemberIds: string[];
  statusLabel: string;
  approximateArea: string;
  lastUpdatedAt: string | null;
}

export interface SafetyPageData {
  canView: boolean;
  canManage: boolean;
  currentMemberId: string | null;
  members: Array<{ id: string; displayName: string }>;
  contacts: SafetyContactItem[];
  protocols: SafetyProtocolItem[];
  locationShares: LocationShareItem[];
  myLocationShare: LocationShareItem | null;
}
