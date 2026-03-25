import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ZodValidationPipe } from 'nestjs-zod';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable Global Zod Validation
  app.useGlobalPipes(new ZodValidationPipe());

  // Enable CORS (Cross-Origin Resource Sharing)
  app.enableCors({
    // ✅ FIXED: Added http:// to the origin
    origin: 'http://localhost:3000', 
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  await app.listen(process.env.PORT ?? 5000);
}
bootstrap();