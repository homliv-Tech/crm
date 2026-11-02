export type NotificationKind =
  | "mention"
  | "stage"
  | "alert"
  | "update"
  | "invite";

export type Notification = {
  id: string;
  kind: NotificationKind;
  actor?: string;
  companyId: string;
  message: string;
  quote?: string;
  time: string;
  unread: boolean;
};

export const NOTIFICATIONS: Notification[] = [
  {
    id: "n1",
    kind: "mention",
    actor: "Mark Darnalds",
    companyId: "microsoft",
    message: "mentioned you on Microsoft",
    quote:
      "Can you join the pilot review on Friday? Procurement wants a security walkthrough.",
    time: "2m ago",
    unread: true,
  },
  {
    id: "n2",
    kind: "stage",
    actor: "Sarah Nguyen",
    companyId: "lvmh",
    message: "moved LVMH to Renewal",
    time: "18m ago",
    unread: true,
  },
  {
    id: "n3",
    kind: "alert",
    companyId: "slack",
    message: "Win probability for Slack dropped to 23%",
    time: "1h ago",
    unread: true,
  },
  {
    id: "n4",
    kind: "update",
    actor: "Emma Green",
    companyId: "shopify",
    message: "updated the Business fit score card for Shopify",
    time: "3h ago",
    unread: false,
  },
  {
    id: "n5",
    kind: "update",
    actor: "Noah Lee",
    companyId: "stripe",
    message: "logged a demo with Stripe",
    time: "Yesterday",
    unread: false,
  },
  {
    id: "n6",
    kind: "alert",
    companyId: "snowflake",
    message: "Pipeline value for Snowflake increased to $520,000",
    time: "2d ago",
    unread: false,
  },
  {
    id: "n7",
    kind: "invite",
    actor: "Grace Miller",
    companyId: "hubspot",
    message: "added you to the Hubspot account team",
    time: "3d ago",
    unread: false,
  },
];
