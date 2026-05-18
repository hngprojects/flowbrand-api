import { AbstractModelAction } from '@hng-sdk/orm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Contact } from '../entities/contact.entity';
import { ICreateContactPayload } from '../interfaces/contact.interface';

@Injectable()
export class ContactModelAction extends AbstractModelAction<Contact> {
  constructor(
    @InjectRepository(Contact)
    repository: Repository<Contact>,
  ) {
    super(repository, Contact);
  }

  async createContact(createPayload: ICreateContactPayload): Promise<Contact> {
    return await this.create({
      createPayload,
      transactionOptions: { useTransaction: false },
    });
  }

  async findById(id: string): Promise<Contact | null> {
    return await this.get({ identifierOptions: { id } });
  }
}
