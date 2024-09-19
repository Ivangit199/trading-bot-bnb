import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { AppService } from './app.service';
import { SetSettingsDto } from './dto/set-settings.dto';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) { }

  @Post('/setSettings')
  async setSettings(@Req() req, @Body() params: SetSettingsDto) {
    return await this.appService.setSettings(params);
  }

  @Get('/getSettings')
  getSettings() {
    return this.appService.getSettings();
  }

  @Get('/ping')
  ping(): string {
    return this.appService.ping();
  }
}
