import {
  Controller, Get, Post, Put, Param, Body,
  Query, ParseUUIDPipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { BorrowersService } from './borrowers.service';
import { CreateBorrowerDto } from './dto/create-borrower.dto';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';

@ApiTags('Borrowers')
@ApiBearerAuth('cognito-jwt')
@Controller('borrowers')
export class BorrowersController {
  constructor(private readonly svc: BorrowersService) {}

  @Post()
  @ApiOperation({ summary: 'Create a borrower' })
  create(@Body() dto: CreateBorrowerDto, @CurrentUser() user: JwtPayload) {
    return this.svc.create(dto, user.tenantId, user.sub);
  }

  @Get()
  @ApiOperation({ summary: 'List borrowers' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query('search') search?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.svc.findAll(user.tenantId, { search, page, limit });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get borrower by ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.svc.findOne(id, user.tenantId);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update borrower' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: Partial<CreateBorrowerDto>,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.update(id, dto, user.tenantId, user.sub);
  }
}
