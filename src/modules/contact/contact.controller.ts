import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ContactService } from './contact.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { ContactSwaggerDocs } from './docs/contact-swagger.doc';
import { Public } from '../../common/decorators/public.decorator';
import * as SYS_MSG from '../../constants/system.messages';

@ApiTags('Contact')
@Controller('contact')
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  @Public()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ContactSwaggerDocs.create()
  async create(@Body() dto: CreateContactDto) {
    const result = await this.contactService.create(dto);
    return {
      statusCode: HttpStatus.CREATED,
      message: SYS_MSG.CONTACT_MESSAGE_SENT_SUCCESSFULLY,
      data: result,
    };
  }
}
