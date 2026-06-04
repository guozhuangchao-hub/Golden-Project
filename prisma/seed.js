require('dotenv/config');

const {
  PrismaClient,
  ProjectStatus,
  MemberRole,
  ModuleStatus,
  TaskStatus,
  TaskPriority,
  TaskLogAction,
  NotificationType,
  NotificationChannel,
  NotificationStatus,
  AIReportType,
} = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  await prisma.notification.deleteMany();
  await prisma.taskLog.deleteMany();
  await prisma.task.deleteMany();
  await prisma.aIReport.deleteMany();
  await prisma.projectModule.deleteMany();
  await prisma.projectMember.deleteMany();
  await prisma.project.deleteMany();
  await prisma.user.deleteMany();

  const users = await Promise.all([
    prisma.user.create({
      data: {
        name: '赵总',
        mobile: '13800000001',
        email: 'zhaozong@golden.local',
        feishuUserId: 'ou_demo_zhaozong',
      },
    }),
    prisma.user.create({
      data: {
        name: '陈凯',
        mobile: '13800000002',
        email: 'chenkai@golden.local',
        feishuUserId: 'ou_demo_chenkai',
      },
    }),
    prisma.user.create({
      data: {
        name: '林霄',
        mobile: '13800000003',
        email: 'linxiao@golden.local',
        feishuUserId: 'ou_demo_linxiao',
      },
    }),
    prisma.user.create({
      data: {
        name: '王晴',
        mobile: '13800000004',
        email: 'wangqing@golden.local',
        feishuUserId: 'ou_demo_wangqing',
      },
    }),
    prisma.user.create({
      data: {
        name: '孙涛',
        mobile: '13800000005',
        email: 'suntao@golden.local',
        feishuUserId: 'ou_demo_suntao',
      },
    }),
    prisma.user.create({
      data: {
        name: '刘颖',
        mobile: '13800000006',
        email: 'liuying@golden.local',
        feishuUserId: 'ou_demo_liuying',
      },
    }),
    prisma.user.create({
      data: {
        name: '临时工小李',
        mobile: '13800000007',
        isTemporary: true,
        wechatOpenId: 'wx_demo_lixiaoli',
      },
    }),
    prisma.user.create({
      data: {
        name: '临时工阿周',
        mobile: '13800000008',
        isTemporary: true,
        wechatOpenId: 'wx_demo_azhou',
      },
    }),
  ]);

  const [
    adminUser,
    stageLeaderUser,
    stageExecutorUser,
    checkinLeaderUser,
    materialLeaderUser,
    transportLeaderUser,
    tempUserOne,
    tempUserTwo,
  ] = users;

  const project = await prisma.project.create({
    data: {
      name: '2026 上海新品发布会',
      code: 'GP-DEMO-2026-01',
      description:
        '用于 Golden Project MVP 演示的活动项目，覆盖舞台、签到、物料、接送四个模块。',
      status: ProjectStatus.ACTIVE,
      location: '上海西岸艺术中心',
      startDate: new Date('2026-06-08T09:00:00.000Z'),
      endDate: new Date('2026-06-10T22:00:00.000Z'),
      createdById: adminUser.id,
    },
  });

  const members = await Promise.all([
    prisma.projectMember.create({
      data: {
        projectId: project.id,
        userId: adminUser.id,
        role: MemberRole.ADMIN,
        title: '项目总控',
      },
    }),
    prisma.projectMember.create({
      data: {
        projectId: project.id,
        userId: stageLeaderUser.id,
        role: MemberRole.LEADER,
        title: '舞台组长',
      },
    }),
    prisma.projectMember.create({
      data: {
        projectId: project.id,
        userId: stageExecutorUser.id,
        role: MemberRole.EXECUTOR,
        title: '舞台执行',
      },
    }),
    prisma.projectMember.create({
      data: {
        projectId: project.id,
        userId: checkinLeaderUser.id,
        role: MemberRole.LEADER,
        title: '签到组长',
      },
    }),
    prisma.projectMember.create({
      data: {
        projectId: project.id,
        userId: materialLeaderUser.id,
        role: MemberRole.LEADER,
        title: '物料组长',
      },
    }),
    prisma.projectMember.create({
      data: {
        projectId: project.id,
        userId: transportLeaderUser.id,
        role: MemberRole.LEADER,
        title: '接送组长',
      },
    }),
    prisma.projectMember.create({
      data: {
        projectId: project.id,
        userId: tempUserOne.id,
        role: MemberRole.TEMP,
        title: '签到临时工',
      },
    }),
    prisma.projectMember.create({
      data: {
        projectId: project.id,
        userId: tempUserTwo.id,
        role: MemberRole.TEMP,
        title: '物料临时工',
      },
    }),
  ]);

  const [
    adminMember,
    stageLeaderMember,
    stageExecutorMember,
    checkinLeaderMember,
    materialLeaderMember,
    transportLeaderMember,
    tempMemberOne,
    tempMemberTwo,
  ] = members;

  const modules = await Promise.all([
    prisma.projectModule.create({
      data: {
        projectId: project.id,
        name: '舞台执行',
        description: '负责彩排、控台、灯光音响联动。',
        status: ModuleStatus.ACTIVE,
        sortOrder: 1,
        leaderMemberId: stageLeaderMember.id,
        startDate: new Date('2026-06-05T01:00:00.000Z'),
        endDate: new Date('2026-06-10T14:00:00.000Z'),
      },
    }),
    prisma.projectModule.create({
      data: {
        projectId: project.id,
        name: '签到接待',
        description: '负责来宾签到、证件和志愿者排班。',
        status: ModuleStatus.ACTIVE,
        sortOrder: 2,
        leaderMemberId: checkinLeaderMember.id,
        startDate: new Date('2026-06-06T01:00:00.000Z'),
        endDate: new Date('2026-06-10T12:00:00.000Z'),
      },
    }),
    prisma.projectModule.create({
      data: {
        projectId: project.id,
        name: '物料统筹',
        description: '负责物料出入库、布场和返场。',
        status: ModuleStatus.ACTIVE,
        sortOrder: 3,
        leaderMemberId: materialLeaderMember.id,
        startDate: new Date('2026-06-04T01:00:00.000Z'),
        endDate: new Date('2026-06-10T15:00:00.000Z'),
      },
    }),
    prisma.projectModule.create({
      data: {
        projectId: project.id,
        name: '嘉宾接送',
        description: '负责车辆调度、司机安排和嘉宾时间协调。',
        status: ModuleStatus.ACTIVE,
        sortOrder: 4,
        leaderMemberId: transportLeaderMember.id,
        startDate: new Date('2026-06-07T01:00:00.000Z'),
        endDate: new Date('2026-06-10T14:00:00.000Z'),
      },
    }),
  ]);

  const [stageModule, checkinModule, materialModule, transportModule] = modules;

  const tasks = await Promise.all([
    prisma.task.create({
      data: {
        projectId: project.id,
        moduleId: stageModule.id,
        title: '确认舞台灯光彩排顺序',
        description: '需要和彩排导演最终确认出场顺序与灯光 cue 点。',
        status: TaskStatus.IN_PROGRESS,
        priority: TaskPriority.URGENT,
        ownerId: stageLeaderUser.id,
        ownerMemberId: stageLeaderMember.id,
        assistantId: stageExecutorUser.id,
        assistantMemberId: stageExecutorMember.id,
        createdById: adminUser.id,
        startTime: new Date('2026-06-02T00:30:00.000Z'),
        dueTime: new Date('2026-06-02T01:30:00.000Z'),
        confirmedAt: new Date('2026-06-02T00:40:00.000Z'),
      },
    }),
    prisma.task.create({
      data: {
        projectId: project.id,
        moduleId: stageModule.id,
        title: '核对主持人彩排话筒编号',
        description: '和音频老师确认备用话筒切换表。',
        status: TaskStatus.PENDING_CONFIRMATION,
        priority: TaskPriority.HIGH,
        ownerId: stageExecutorUser.id,
        ownerMemberId: stageExecutorMember.id,
        assistantId: stageLeaderUser.id,
        assistantMemberId: stageLeaderMember.id,
        createdById: adminUser.id,
        startTime: new Date('2026-06-02T01:00:00.000Z'),
        dueTime: new Date('2026-06-02T02:10:00.000Z'),
      },
    }),
    prisma.task.create({
      data: {
        projectId: project.id,
        moduleId: checkinModule.id,
        title: '给临时工推送签到点位图',
        description: '通过小程序发送各签到点位图和集合时间。',
        status: TaskStatus.IN_PROGRESS,
        priority: TaskPriority.HIGH,
        ownerId: checkinLeaderUser.id,
        ownerMemberId: checkinLeaderMember.id,
        assistantId: tempUserOne.id,
        assistantMemberId: tempMemberOne.id,
        createdById: adminUser.id,
        startTime: new Date('2026-06-02T01:10:00.000Z'),
        dueTime: new Date('2026-06-02T02:40:00.000Z'),
        confirmedAt: new Date('2026-06-02T01:20:00.000Z'),
      },
    }),
    prisma.task.create({
      data: {
        projectId: project.id,
        moduleId: materialModule.id,
        title: '补齐返场物料清点名单',
        description: '返场清点缺 2 名临时工，需今天中午前确认补位。',
        status: TaskStatus.OVERDUE,
        priority: TaskPriority.URGENT,
        ownerId: materialLeaderUser.id,
        ownerMemberId: materialLeaderMember.id,
        assistantId: tempUserTwo.id,
        assistantMemberId: tempMemberTwo.id,
        createdById: adminUser.id,
        startTime: new Date('2026-06-01T10:00:00.000Z'),
        dueTime: new Date('2026-06-02T00:20:00.000Z'),
        confirmedAt: new Date('2026-06-01T10:20:00.000Z'),
      },
    }),
    prisma.task.create({
      data: {
        projectId: project.id,
        moduleId: transportModule.id,
        title: '确认 16:00 嘉宾接送车辆补位',
        description: '高峰时段车辆轮换压力大，需要增补一辆商务车。',
        status: TaskStatus.CONFIRMED,
        priority: TaskPriority.HIGH,
        ownerId: transportLeaderUser.id,
        ownerMemberId: transportLeaderMember.id,
        createdById: adminUser.id,
        startTime: new Date('2026-06-02T03:30:00.000Z'),
        dueTime: new Date('2026-06-02T08:00:00.000Z'),
        confirmedAt: new Date('2026-06-02T03:40:00.000Z'),
      },
    }),
    prisma.task.create({
      data: {
        projectId: project.id,
        moduleId: materialModule.id,
        title: '更新主视觉喷绘安装点位',
        description: '已和场地方确认最新尺寸，任务闭环。',
        status: TaskStatus.COMPLETED,
        priority: TaskPriority.MEDIUM,
        ownerId: materialLeaderUser.id,
        ownerMemberId: materialLeaderMember.id,
        createdById: adminUser.id,
        startTime: new Date('2026-06-01T02:00:00.000Z'),
        dueTime: new Date('2026-06-01T09:00:00.000Z'),
        confirmedAt: new Date('2026-06-01T02:20:00.000Z'),
        completedAt: new Date('2026-06-01T08:40:00.000Z'),
      },
    }),
  ]);

  const [
    taskStageRunbook,
    taskMicCheck,
    taskMiniappNotify,
    taskMaterialRisk,
    taskTransportPeak,
    taskVisualDone,
  ] = tasks;

  await prisma.taskLog.createMany({
    data: [
      {
        taskId: taskStageRunbook.id,
        action: TaskLogAction.CREATED,
        operatorId: adminUser.id,
        toStatus: TaskStatus.PENDING_CONFIRMATION,
        content: '总控下发舞台彩排顺序确认任务。',
      },
      {
        taskId: taskStageRunbook.id,
        action: TaskLogAction.CONFIRMED,
        operatorId: stageLeaderUser.id,
        fromStatus: TaskStatus.PENDING_CONFIRMATION,
        toStatus: TaskStatus.CONFIRMED,
        content: '舞台组长已确认接单。',
      },
      {
        taskId: taskStageRunbook.id,
        action: TaskLogAction.STATUS_CHANGED,
        operatorId: stageLeaderUser.id,
        fromStatus: TaskStatus.CONFIRMED,
        toStatus: TaskStatus.IN_PROGRESS,
        content: '已进入彩排现场执行。',
      },
      {
        taskId: taskMiniappNotify.id,
        action: TaskLogAction.CREATED,
        operatorId: adminUser.id,
        toStatus: TaskStatus.PENDING_CONFIRMATION,
        content: '安排签到组给临时工推送点位图。',
      },
      {
        taskId: taskMiniappNotify.id,
        action: TaskLogAction.CONFIRMED,
        operatorId: checkinLeaderUser.id,
        fromStatus: TaskStatus.PENDING_CONFIRMATION,
        toStatus: TaskStatus.CONFIRMED,
        content: '签到组长确认，准备走小程序通知。',
      },
      {
        taskId: taskMiniappNotify.id,
        action: TaskLogAction.STATUS_CHANGED,
        operatorId: checkinLeaderUser.id,
        fromStatus: TaskStatus.CONFIRMED,
        toStatus: TaskStatus.IN_PROGRESS,
        content: '通知分发中，仍有部分人员未读。',
      },
      {
        taskId: taskMaterialRisk.id,
        action: TaskLogAction.CREATED,
        operatorId: adminUser.id,
        toStatus: TaskStatus.PENDING_CONFIRMATION,
        content: '总控要求补齐返场清点名单。',
      },
      {
        taskId: taskMaterialRisk.id,
        action: TaskLogAction.CONFIRMED,
        operatorId: materialLeaderUser.id,
        fromStatus: TaskStatus.PENDING_CONFIRMATION,
        toStatus: TaskStatus.CONFIRMED,
        content: '物料组长已确认，但临时工未补齐。',
      },
      {
        taskId: taskMaterialRisk.id,
        action: TaskLogAction.STATUS_CHANGED,
        operatorId: materialLeaderUser.id,
        fromStatus: TaskStatus.CONFIRMED,
        toStatus: TaskStatus.OVERDUE,
        content: '已超过补位截止时间。',
      },
      {
        taskId: taskVisualDone.id,
        action: TaskLogAction.COMPLETED,
        operatorId: materialLeaderUser.id,
        fromStatus: TaskStatus.IN_PROGRESS,
        toStatus: TaskStatus.COMPLETED,
        content: '主视觉喷绘安装点位已完成。',
      },
    ],
  });

  await prisma.notification.createMany({
    data: [
      {
        projectId: project.id,
        taskId: taskMiniappNotify.id,
        receiverId: tempUserOne.id,
        senderId: checkinLeaderUser.id,
        type: NotificationType.TASK_ASSIGNED,
        channel: NotificationChannel.MINI_PROGRAM,
        status: NotificationStatus.SENT,
        title: '新的签到任务已下发',
        content: '请查看签到点位图，并于 14:00 前到达集合点。',
        sentAt: new Date('2026-06-02T01:25:00.000Z'),
      },
      {
        projectId: project.id,
        taskId: taskMaterialRisk.id,
        receiverId: adminUser.id,
        senderId: materialLeaderUser.id,
        type: NotificationType.TASK_OVERDUE,
        channel: NotificationChannel.FEISHU,
        status: NotificationStatus.SENT,
        title: '物料返场任务已逾期',
        content: '返场清点人员补位未完成，建议立刻追加临时工。',
        sentAt: new Date('2026-06-02T00:30:00.000Z'),
      },
      {
        projectId: project.id,
        taskId: taskTransportPeak.id,
        receiverId: transportLeaderUser.id,
        senderId: adminUser.id,
        type: NotificationType.TASK_CREATED,
        channel: NotificationChannel.SYSTEM,
        status: NotificationStatus.READ,
        title: '嘉宾接送高峰任务',
        content: '请在下午高峰前确认车辆补位。',
        sentAt: new Date('2026-06-02T03:35:00.000Z'),
        readAt: new Date('2026-06-02T03:42:00.000Z'),
      },
    ],
  });

  await prisma.aIReport.createMany({
    data: [
      {
        projectId: project.id,
        reportDate: new Date('2026-06-02T00:00:00.000Z'),
        type: AIReportType.DAILY,
        title: 'AI 日报：执行资源已进入高峰',
        content:
          '舞台与签到模块推进正常，但物料返场清点存在人员分配不足，建议今晚前补两名临时工。',
        summary:
          '舞台与签到推进稳定，物料模块存在返场清点缺口，需要管理层支持调人。',
        sourceData: {
          taskCount: 6,
          overdueCount: 1,
          notificationsSent: 3,
        },
        generatedBy: 'coze',
        createdById: adminUser.id,
      },
      {
        projectId: project.id,
        reportDate: new Date('2026-06-02T00:00:00.000Z'),
        type: AIReportType.RISK,
        title: '风险总结：嘉宾接送波峰在 16:00',
        content:
          '两辆接驳车的排班间隔过密，存在司机轮换风险，需要在下午前完成补位。',
        summary: '16:00 至 17:00 为接送高峰，建议增加一辆备用商务车。',
        sourceData: {
          module: '嘉宾接送',
          peakWindow: '16:00-17:00',
          recommendedCars: 3,
        },
        generatedBy: 'coze',
        createdById: adminUser.id,
      },
    ],
  });

  console.log('Seed completed.');
  console.log(`Project ID: ${project.id}`);
  console.log(`Dashboard URL: http://localhost:3001/console/dashboard?projectId=${project.id}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
