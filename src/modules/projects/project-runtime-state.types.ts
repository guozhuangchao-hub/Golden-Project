export type StructureNodeData = {
  taskName?: string;
  taskTime?: string;
  taskPerson?: string;
  claimable?: boolean;
  assignedMemberId?: string;
  assignedMemberName?: string;
};

export type StructureTreeNode = {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder?: number;
  data?: StructureNodeData;
};

export type StructureTreeState = {
  tree: StructureTreeNode[];
};

export type IdentityClaim = {
  memberId?: string;
  memberName?: string;
};

export type IdentityClaimsState = Record<string, IdentityClaim>;
