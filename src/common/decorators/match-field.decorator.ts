import { registerDecorator, ValidationOptions, ValidationArguments } from 'class-validator';

export function MatchesField(field: string, validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'matchesField',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [field],
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const [relatedPropertyName] = args.constraints as string[];
          const relatedValue = (args.object as Record<string, unknown>)[relatedPropertyName];
          return value === relatedValue;
        },
      },
    });
  };
}