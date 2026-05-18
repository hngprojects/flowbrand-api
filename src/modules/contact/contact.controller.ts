import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ContactService } from './contact.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { IContactResponse } from './interfaces/contact.interface';
import { ContactSwaggerDocs } from './docs/contact-swagger.doc';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Contact')
@Controller('contact')
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  @Public()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ContactSwaggerDocs.create()
  async create(@Body() dto: CreateContactDto): Promise<IContactResponse> {
    return this.contactService.create(dto);
  }
}
