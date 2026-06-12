import { BadRequestException } from '@nestjs/common';
import { AppExceptionFilter } from '../src/platform/http/app-exception.filter';

describe('AppExceptionFilter', () => {
  it('normalizes HttpException responses into a stable error envelope', () => {
    const filter = new AppExceptionFilter();
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const request = { url: '/api/projects/test' };
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => request,
      }),
    } as any;

    filter.catch(new BadRequestException('Invalid payload'), host);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({
          statusCode: 400,
          message: 'Invalid payload',
        }),
        path: '/api/projects/test',
      }),
    );
  });
});
