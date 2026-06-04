import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CreateEventDto } from './dto/create-event.dto';
import { ListEventsQueryDto } from './dto/list-events-query.dto';
import { ReviewEventDto, UpdateEventStatusDto } from './dto/review-event.dto';
import { EventsService } from './events.service';

@Controller('projects/:projectId/events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post()
  create(@Param('projectId') projectId: string, @Body() dto: CreateEventDto) {
    return this.eventsService.create(projectId, dto);
  }

  @Post('ingest')
  ingest(@Param('projectId') projectId: string, @Body() dto: CreateEventDto) {
    return this.eventsService.create(projectId, dto);
  }

  @Post('demo-seed')
  seedDemo(@Param('projectId') projectId: string) {
    return this.eventsService.seedDemoEvents(projectId);
  }

  @Get()
  findAll(@Param('projectId') projectId: string, @Query() query: ListEventsQueryDto) {
    return this.eventsService.findAll(projectId, query);
  }

  @Get('pending-review')
  findPendingReview(@Param('projectId') projectId: string) {
    return this.eventsService.findPendingReview(projectId);
  }

  @Get(':eventId')
  findOne(@Param('eventId') eventId: string) {
    return this.eventsService.findOne(eventId);
  }

  @Post(':eventId/confirm')
  confirm(@Param('eventId') eventId: string, @Body() dto: ReviewEventDto) {
    return this.eventsService.confirm(eventId, dto);
  }

  @Post(':eventId/reject')
  reject(@Param('eventId') eventId: string, @Body() dto: ReviewEventDto) {
    return this.eventsService.reject(eventId, dto);
  }

  @Post(':eventId/needs-more-info')
  needsMoreInfo(@Param('eventId') eventId: string, @Body() dto: ReviewEventDto) {
    return this.eventsService.needsMoreInfo(eventId, dto);
  }

  @Patch(':eventId/status')
  updateStatus(@Param('eventId') eventId: string, @Body() dto: UpdateEventStatusDto) {
    return this.eventsService.updateStatus(eventId, dto);
  }
}
