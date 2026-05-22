import { Controller, Get } from '@nestjs/common';
import { Public } from './common/decorators/public.decorator';

@Controller()
export class AppController {
  @Public()
  @Get(['', 'api'])
  getHello() {
    return {
      status: 'active',
      message: 'Welcome to the Flowbrand API.',
      timestamp: new Date().toISOString(),
    };
  }
}