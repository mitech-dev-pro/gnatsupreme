ALTER TYPE "member_workflow_action" ADD VALUE 'INACTIVATED';
ALTER TYPE "member_workflow_action" ADD VALUE 'REACTIVATED';

ALTER TABLE "member_workflow_events" ALTER COLUMN "performed_by_id" DROP NOT NULL;
ALTER TABLE "member_workflow_events" DROP CONSTRAINT "MemberWorkflowEvent_performedById_fkey";
ALTER TABLE "member_workflow_events" ADD CONSTRAINT "MemberWorkflowEvent_performedById_fkey" FOREIGN KEY ("performed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
