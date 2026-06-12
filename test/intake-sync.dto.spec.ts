import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { IntakeSyncDto } from '../src/modules/projects/dto/intake-sync.dto';

describe('IntakeSyncDto', () => {
  it('accepts a valid intake sync payload', async () => {
    const dto = plainToInstance(IntakeSyncDto, {
      projectName: '2026 企业发布会',
      location: '上海',
      startDate: '2026-06-12T08:00:00.000Z',
      modules: [{ name: '签到组', desc: '负责签到', leader: '张三' }],
      members: [{ name: '李四', role: '执行人员', title: '执行' }],
      tasks: [{ title: '准备胸卡', deadline: '2026-06-12T10:00:00.000Z', priority: 'HIGH' }],
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('rejects invalid nested member role and invalid task deadline', async () => {
    const dto = plainToInstance(IntakeSyncDto, {
      members: [{ name: '李四', role: '随便写' }],
      tasks: [{ title: '准备胸卡', deadline: 'tomorrow morning' }],
    });

    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
  });
});
