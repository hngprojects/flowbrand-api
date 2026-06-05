import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';

export function InitiatePaymentDocs() {
  return applyDecorators(
    ApiOperation({ summary: 'Initiate a Pro plan one-time payment' }),
    ApiResponse({
      status: HttpStatus.CREATED,
      description: 'Payment session created. Redirect the user to authorizationUrl to complete payment.',
      schema: {
        example: {
          statusCode: 201,
          message: 'Payment initiated successfully',
          data: {
            reference: '550e8400-e29b-41d4-a716-446655440000',
            authorizationUrl: 'https://checkout.paystack.com/0peioxfhpn',
            amount: 900000,
            currency: 'NGN',
          },
        },
      },
    }),
    ApiResponse({ status: HttpStatus.CONFLICT, description: 'User is already on the Pro plan, or a payment for this request is already in progress.' }),
    ApiResponse({ status: HttpStatus.TOO_MANY_REQUESTS, description: 'Rate limit exceeded — max 5 initiations per hour per user.' }),
    ApiResponse({ status: HttpStatus.PAYMENT_REQUIRED, description: 'Provider declined the payment.' }),
    ApiResponse({ status: HttpStatus.BAD_GATEWAY, description: 'Payment provider is unavailable or returned an unexpected error.' }),
    ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Missing or invalid JWT. Handled by the global AuthGuard.' }),
  );
}
