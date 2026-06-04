require('dotenv/config');

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function deleteProjectCascade(projectId) {
  await prisma.$transaction([
    prisma.notification.deleteMany({ where: { projectId } }),
    prisma.aIReport.deleteMany({ where: { projectId } }),
    prisma.feishuTaskProposal.deleteMany({ where: { projectId } }),
    prisma.feishuMessage.deleteMany({ where: { projectId } }),
    prisma.feishuProjectSetting.deleteMany({ where: { projectId } }),
    prisma.agentInboundEvent.deleteMany({ where: { projectId } }),
    prisma.agentIntegrationSetting.deleteMany({ where: { projectId } }),
    prisma.projectModule.deleteMany({ where: { projectId } }),
    prisma.projectMember.deleteMany({ where: { projectId } }),
    prisma.task.deleteMany({ where: { projectId } }),
    prisma.project.delete({ where: { id: projectId } }),
  ]);
}

async function main() {
  const projects = await prisma.project.findMany({
    orderBy: [{ name: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, name: true, code: true, createdAt: true },
  });

  const grouped = new Map();
  for (const project of projects) {
    const list = grouped.get(project.name) || [];
    list.push(project);
    grouped.set(project.name, list);
  }

  const summary = [];

  for (const [name, group] of grouped.entries()) {
    if (group.length <= 1) {
      continue;
    }

    const keeper = group[0];
    const extras = group.slice(1);

    for (const extra of extras) {
      const [tasks, members] = await Promise.all([
        prisma.task.count({ where: { projectId: extra.id } }),
        prisma.projectMember.count({ where: { projectId: extra.id } }),
      ]);

      if (tasks > 0 || members > 0) {
        summary.push({
          name,
          kept: keeper.code,
          skipped: extra.code,
          reason: `has tasks=${tasks}, members=${members}`,
        });
        continue;
      }

      await deleteProjectCascade(extra.id);
      summary.push({
        name,
        kept: keeper.code,
        removed: extra.code,
      });
    }
  }

  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
