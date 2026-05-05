import { NestFactory, Reflector } from '@nestjs/core';
import { ClassSerializerInterceptor, Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './shared/infrastructure/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);

  const apiPrefix = config.get<string>('API_PREFIX', 'api');
  const port = config.get<number>('PORT', 3000);
  const corsOrigin = config.get<string>('CORS_ORIGIN', '*');

  app.enableCors({ origin: corsOrigin, credentials: true });
  app.setGlobalPrefix(apiPrefix);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));
  app.useGlobalFilters(new HttpExceptionFilter());

  // Swagger
  const swaggerCfg = new DocumentBuilder()
    .setTitle('SQL Judge API')
    .setDescription('Plataforma inteligente para evaluación y optimización de SQL')
    .setVersion('0.1.0')
    .addBearerAuth()
    .addTag('auth', 'Autenticación y registro')
    .addTag('users', 'Gestión de usuarios (ADMIN)')
    .addTag('courses', 'Cursos académicos')
    .addTag('challenges', 'Retos SQL')
    .addTag('schemas', 'Esquemas SQL de los retos')
    .addTag('test-data', 'Datos de prueba y generador')
    .addTag('submissions', 'Envío de soluciones SQL (Entrega 2)')
    .addTag('health', 'Health checks')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerCfg);
  SwaggerModule.setup(config.get<string>('SWAGGER_PATH', 'docs'), app, document);

  await app.listen(port);
  Logger.log(`API escuchando en http://localhost:${port}/${apiPrefix}`, 'Bootstrap');
  Logger.log(`Swagger disponible en http://localhost:${port}/${config.get<string>('SWAGGER_PATH', 'docs')}`, 'Bootstrap');
}

bootstrap();
