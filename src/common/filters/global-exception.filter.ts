import {
    ArgumentsHost,
    Catch,
    ExceptionFilter,
    HttpException,
    HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { QueryFailedError } from 'typeorm';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
    catch(exception: unknown, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();

        let status = HttpStatus.INTERNAL_SERVER_ERROR;
        let message = 'Internal server error';

        // ✅ NestJS HttpException (NotFound, BadRequest, etc.)
        if (exception instanceof HttpException) {
            status = exception.getStatus();
            message = exception.message;
        }

        // ✅ TypeORM QueryFailedError (MySQL)
        else if (exception instanceof QueryFailedError) {
            const err: any = exception;

            // Duplicate key in MySQL (ER_DUP_ENTRY = 1062)
            if (err.code === 'ER_DUP_ENTRY') {
                status = HttpStatus.CONFLICT;
                const field = this.extractDuplicateField(err.message);
                message = `Duplicate value for unique field(s): ${field}`;
            } else {
                status = HttpStatus.BAD_REQUEST;
                message = `MySQL Error: ${err.message}`;
            }
        }

        response.status(status).json({
            statusCode: status,
            message,
            timestamp: new Date().toISOString(),
            path: ctx.getRequest().url,
        });
    }

    // Helper to parse duplicate field from MySQL error message
    private extractDuplicateField(msg: string): string {
        const match = msg.match(/for key '(.+?)'/);
        if (match) {
            return match[1].replace('users.', '');
        }
        return 'unknown';
    }
}
