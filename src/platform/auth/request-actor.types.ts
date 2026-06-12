export type SystemActorRole = 'SYSTEM_ADMIN' | 'SERVICE';

export type RequestActor = {
  userId?: string;
  systemRole?: SystemActorRole;
  name?: string;
};

export type PermissionAction =
  | 'PROJECT_DELETE'
  | 'PROJECT_STRUCTURE_WRITE'
  | 'PROJECT_RUNTIME_WRITE'
  | 'PROJECT_FILE_READ'
  | 'TASK_ADMIN_WRITE'
  | 'TASK_MEMBER_WRITE'
  | 'EVENT_REVIEW'
  | 'AGENT_WORKFLOW_TRIGGER';

export type PermissionMetadata = {
  action: PermissionAction;
  projectParam?: string;
  taskParam?: string;
  eventParam?: string;
  riskParam?: string;
  proposalParam?: string;
  resourceIdParam?: string;
};
