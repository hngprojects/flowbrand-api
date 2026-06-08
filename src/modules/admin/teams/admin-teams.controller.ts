import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminTeamsService } from './admin-teams.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { InviteMembersDto } from './dto/invite-members.dto';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { AdminJwtGuard } from '../../auth/guards/admin-jwt.guard';
import { Public } from '../../../common/decorators/public.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../users/dto/pagination.dto';
import * as SYS_MSG from '../../../constants/system.messages';
import {
  GetTeamsDocs,
  CreateTeamDocs,
  DeleteTeamDocs,
  InviteMembersDocs,
  GetInvitationsDocs,
  RevokeInvitationDocs,
  AcceptInviteDocs,
  RevokeMemberDocs
} from './docs/admin-teams-swagger.doc';

@ApiTags('admin-teams')
@ApiBearerAuth('JWT')
@UseGuards(AdminJwtGuard)
@Controller('admin/teams')
export class AdminTeamsController {
  constructor(private readonly adminTeamsService: AdminTeamsService) {}

  @Post('invitations/accept')
  @Public()
  @HttpCode(HttpStatus.CREATED)
  @AcceptInviteDocs()
  async acceptInvite(@Body() dto: AcceptInviteDto) {
    const data = await this.adminTeamsService.acceptInvite(dto);
    return {
      statusCode: HttpStatus.CREATED,
      message: SYS_MSG.INVITE_ACCEPTED_SUCCESSFULLY,
      data,
    };
  }
  
  @Get()
  @HttpCode(HttpStatus.OK)
  @GetTeamsDocs()
  async findAll(@Query() pagination: PaginationDto) {
    const result = await this.adminTeamsService.findAll(pagination);
    return {
      statusCode: HttpStatus.OK,
      message: SYS_MSG.TEAMS_RETRIEVED_SUCCESSFULLY,
      ...result,
    };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @CreateTeamDocs()
  async create(
    @Body() dto: CreateTeamDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const team = await this.adminTeamsService.create(dto, user.userId);
    return {
      statusCode: HttpStatus.CREATED,
      message: SYS_MSG.TEAM_CREATED_SUCCESSFULLY,
      data: team,
    };
  }

  @Delete(':teamId')
  @HttpCode(HttpStatus.OK)
  @DeleteTeamDocs()
  async softDelete(
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.adminTeamsService.softDelete(teamId, user.userId);
    return { 
      statusCode: HttpStatus.OK,
      message: SYS_MSG.TEAM_DELETED_SUCCESSFULLY,
      data: { success: true }, 
    };
  }

  @Post(':teamId/invite')
  @HttpCode(HttpStatus.OK)
  @InviteMembersDocs()
  async inviteMembers(
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Body() dto: InviteMembersDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const data = await this.adminTeamsService.inviteMembers(teamId, dto, user.userId);
    return {
      statusCode: HttpStatus.OK,
      message: SYS_MSG.TEAM_INVITES_DISPATCHED,
      data,
    };
  }

  @Get(':teamId/invitations')
  @HttpCode(HttpStatus.OK)
  @GetInvitationsDocs()
  async getInvitations(@Param('teamId', ParseUUIDPipe) teamId: string) {
    const data = await this.adminTeamsService.getInvitations(teamId);
    return {
      statusCode: HttpStatus.OK,
      message: SYS_MSG.TEAM_INVITATIONS_RETRIEVED,
      data,
    };
  }

  @Delete(':teamId/invitations/:inviteId')
  @HttpCode(HttpStatus.OK)
  @RevokeInvitationDocs()
  async revokeInvitation(
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Param('inviteId', ParseUUIDPipe) inviteId: string,
  ) {
    await this.adminTeamsService.revokeInvitation(teamId, inviteId);
    return {
      statusCode: HttpStatus.OK,
      message: SYS_MSG.TEAM_INVITATION_REVOKED,
      data: { success: true },
    };
  }

  @Delete(':teamId/members/:memberId')
  @ApiBearerAuth('JWT')
  @UseGuards(AdminJwtGuard)
  @HttpCode(HttpStatus.OK)
  @RevokeMemberDocs()
  async revokeMember(
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.adminTeamsService.revokeMember(teamId, memberId, user.userId);
    return { 
      statusCode: HttpStatus.OK,
      message: SYS_MSG.MEMBER_REVOKED_SUCCESSFULLY,
      data: { success: true },
    };
  }
}