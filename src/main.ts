import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error'],
  });

  const config = app.get(ConfigService);
  const PORT = config.get('PORT') || 8000;
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    stopAtFirstError: true
  }));
  app.enableCors({ credentials: true });
  app.setGlobalPrefix('api');

  await app.listen(PORT, () => console.log('🎉 APP HAS STARTED'));
}
bootstrap();
