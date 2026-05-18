import { ContactStatus } from '../enums/contact-status.enum';

export interface IContact {
  id: string;
  fullName: string;
  email: string;
  businessName: string | null;
  message: string;
  status: ContactStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICreateContactPayload {
  full_name: string;
  email: string;
  business_name: string;
  message: string;
}

export interface IContactResponse {
  id: string;
  fullName: string;
  email: string;
  businessName: string | null;
  message: string;
  status: ContactStatus;
  createdAt: Date;
}
